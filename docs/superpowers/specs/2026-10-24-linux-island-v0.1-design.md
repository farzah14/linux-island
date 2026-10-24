# Linux Island — Technical Design Specification v0.1

**Document ID:** LI-TDS-001  
**Versi dokumen:** 1.0 (untuk review)  
**Tanggal:** 24 Oktober 2026  
**Status:** Proposed — menunggu review spesifikasi tertulis  
**Target produk:** Linux Island v0.1 (MVP)  
**Bahasa dokumen:** Indonesia

## 1. Tujuan dan ringkasan keputusan

Linux Island adalah antarmuka status dan kontrol kontekstual berbentuk kapsul untuk desktop Linux. Tujuan jangka panjangnya adalah pengalaman *Hybrid Island* lintas desktop environment; v0.1 memvalidasi pengalaman inti pada **Ubuntu + GNOME (Wayland)**.

Keputusan yang telah disetujui:

1. Mendukung berbagai desktop environment sebagai **target produk jangka panjang** (GNOME, KDE Plasma, XFCE, Cinnamon, dan lainnya).
2. Menargetkan tiga mode tampilan: **Dynamic**, **Floating**, dan **Integrated**; cakupan implementasi tiap mode dibedakan berdasarkan versi.
3. Tujuh kelompok fitur produk: Media Player, Notifications, System Monitoring, Quick Settings, File Shelf, Timer & Calendar, Customization.
4. Stack inti: **C++20 + Qt 6**, antarmuka konfigurasi **Qt Quick/QML**, integrasi GNOME melalui **GNOME Shell Extension (GJS)**, komunikasi antarproses menggunakan **D-Bus Session Bus**, build system **CMake**.
5. Default idle behavior **Smart Adaptive**, visual **Modern Minimalist**, dan interaksi **hover preview → click expanded → click outside close**.
6. State machine: `HIDDEN`, `COMPACT`, `PREVIEW`, `EXPANDED`, `PEEK`; sistem penjadwalan event **Context-Aware Priority**.
7. Kontrak D-Bus, alur media/notifikasi/pengaturan, dan prinsip error recovery telah disetujui secara konseptual.

**Klarifikasi cakupan:** “lintas desktop environment” tidak berarti v0.1 sudah sepenuhnya mendukung seluruh compositor. v0.1 bersifat **GNOME-first** dengan modul yang dapat ditukar untuk platform lain.

## 2. Lingkup rilis

### 2.1 Termasuk dalam MVP v0.1

- GNOME Shell Extension yang menampilkan kapsul **Dynamic Mode** pada panel/overlay GNOME yang sesuai dengan batasan versi Shell.
- Lima state UI, animasi dasar, hover preview, click expand, click-outside close.
- Media Player melalui MPRIS2: penemuan pemain, metadata, status playback, Play/Pause, Next, Previous, pemilihan player aktif.
- Notifikasi dasar sebagai tampilan kontekstual **jika** integrasi GNOME yang kompatibel dapat menghindari popup ganda; fallback menggunakan notifikasi GNOME normal.
- Qt/QML Settings: light/dark (dapat mengikuti sistem), ukuran dasar, preferensi animasi, preferensi media, opsi notifikasi yang didukung.
- Smart Adaptive untuk fullscreen pada monitor utama dengan mekanisme GNOME Shell yang didukung; fallback ke keadaan tidak mengganggu jika informasi tidak tersedia.
- Layanan C++ Core berjalan pada sesi pengguna; IPC asynchronous, pembaruan berbasis signal, reconnect, dan recovery.
- Packaging pengembang, logging aman, dan pengujian unit/integrasi dasar.

### 2.2 Tidak termasuk dalam MVP v0.1

- System Monitoring dan Quick Settings penuh (target v0.2).
- File Shelf, drag-and-drop lintas aplikasi, Timer & Calendar (target v0.3).
- Adapter KDE/XFCE/Cinnamon, mode Integrated lintas desktop, multi-monitor penuh (tahap berikutnya).
- Mode Floating lintas compositor yang dijamin bekerja identik. Fondasi `DisplayMode` disiapkan sejak v0.1, tetapi **hanya Dynamic Mode diwajibkan berfungsi** pada GNOME-first MVP.
- Penggantian daemon notifikasi GNOME, akses root, atau kontrol desktop global yang tidak disediakan sistem.
- Plugin publik pihak ketiga dan sinkronisasi cloud.

### 2.3 Asumsi platform yang harus divalidasi

- Platform pengujian awal adalah Ubuntu dengan sesi GNOME Wayland. Untuk matriks uji pertama, **Ubuntu 24.04 LTS / GNOME 46** dijadikan *baseline yang diusulkan*, bukan versi yang sudah dikonfirmasi pengguna.
- Dukungan pada versi GNOME lainnya harus dinyatakan melalui matriks kompatibilitas dan pengujian nyata; GNOME extension memanfaatkan API yang dapat berubah di antara rilis.
- Pada v0.1, satu monitor utama menjadi skenario rilis minimum.

## 3. Non-functional requirements

| ID | Kebutuhan | Kriteria awal |
|---|---|---|
| NFR-01 | Stabilitas Shell | Core mati/restart tidak membuat sesi GNOME Shell ikut berhenti. |
| NFR-02 | Respons interaksi | Hover/click dan animasi state berjalan lokal pada proses Shell; tidak menunggu balasan D-Bus. |
| NFR-03 | Kinerja | Target desain: UI tetap halus dalam pengujian 60 Hz, tanpa animasi blocking; angka performa merupakan target uji, **bukan benchmark terukur**. |
| NFR-04 | Efisiensi | Monitoring pasif dan event-driven; hindari polling cepat dan I/O berulang. |
| NFR-05 | Keamanan | Tidak membutuhkan hak root; tidak mengeksekusi shell command dari pesan D-Bus. |
| NFR-06 | Privasi | Tidak mengunggah metadata media/notifikasi, tidak mencatat isi notifikasi dalam log secara default. |
| NFR-07 | Aksesibilitas | Keyboard focus untuk kontrol utama, label aksesibel, dukungan reduced motion bila tersedia. |
| NFR-08 | Modularitas | Core tidak mengimpor GNOME Shell API; adapter GNOME tidak memuat library Qt langsung ke proses Shell. |
| NFR-09 | Error tolerance | Degradasi fitur terisolasi, log terstruktur, reconnect saat nama layanan berganti pemilik. |

## 4. Arsitektur logis dan kepemilikan komponen

```text
+------------------------- GNOME Shell process -----------------------+
|  Linux Island Extension (GJS)                                      |
|  - Capsule Renderer (St/Clutter)                                   |
|  - Interaction & UI State Machine                                  |
|  - Smart Adaptive (GNOME/Mutter window information)                 |
|  - Notification Integration Adapter (GNOME-owned notification UI)  |
|  - DBus Client (asynchronous)                                       |
+-------------------------------|------------------------------------+
                                | D-Bus Session Bus
+-------------------------------|------------------------------------+
|  Linux Island Core (C++20 / Qt 6)                                  |
|  - CoreService / DBus Adaptor                                      |
|  - MediaService (MPRIS2)                                           |
|  - SettingsService (QSettings, validated writes)                   |
|  - StateSnapshot / revisions / capabilities                        |
|  - Event Normalizer                                                |
+-----------------------------------^--------------------------------+
                                    | D-Bus Session Bus
+-----------------------------------|--------------------------------+
|  Linux Island Settings App (Qt Quick/QML)                           |
|  - UI preferences and validation feedback                          |
+--------------------------------------------------------------------+

External dependency: org.mpris.MediaPlayer2.* service(s)
System integration: GNOME Shell APIs and org.freedesktop.Notifications
```

### 4.1 Prinsip boundary

- **Extension memiliki state interaksi/UI** (`HIDDEN/COMPACT/PREVIEW/EXPANDED/PEEK`) dan animasi, agar hover tidak terhambat IPC.
- **Core memiliki state data**: media player aktif, playback metadata, settings, core availability, dan nomor revisi data.
- **GNOME Shell tetap memiliki state native** seperti fullscreen, panel, workspace, dan notifikasi. Adapter GNOME mengamati perubahan ini; tidak memindahkan state privat Shell menjadi bagian kontrak lintas desktop.
- **Settings app** hanya menggunakan kontrak Core untuk data/settings bersama; konfigurasi UI khusus ekstensi dapat diturunkan dari settings umum.

### 4.2 Modul dan antarmuka internal yang diusulkan

| Modul | Tanggung jawab | Dependensi utama |
|---|---|---|
| `CoreService` | Lifecycle, exposure D-Bus, snapshot | Qt Core, Qt DBus |
| `MediaService` | Discovery/control MPRIS2, normalisasi metadata | Qt DBus |
| `SettingsService` | Schema, validasi, persistence, revision | Qt Core / QSettings |
| `EventNormalizer` | Coalescing perubahan data, urutan revision | Core internals |
| `IslandController` (GJS) | State machine dan interaksi | GNOME Shell APIs |
| `GnomeDisplayAdapter` (GJS) | Posisi dan fullscreen monitoring | Mutter/Meta, GNOME Shell |
| `NotificationAdapter` (GJS) | Preview aman dan suppression policy | GNOME notification APIs |
| `CoreProxy` (GJS) | D-Bus calls/signals, reconnection, snapshot | Gio.DBusProxy |
| `SettingsView` (QML) | Editor konfigurasi | Qt Quick, Core proxy |

## 5. State machine UI dan event priority

### 5.1 States

| State | Pemicu utama | Perilaku |
|---|---|---|
| `COMPACT` | Default, dismiss, timeout | Kapsul ringkas; tidak menutupi pekerjaan secara berlebihan. |
| `PREVIEW` | Hover pada capsule | Menampilkan ringkasan; kembali ke COMPACT setelah pointer leave + delay. |
| `EXPANDED` | Click capsule | Kontrol interaktif; tetap terbuka hingga dismiss/click outside. |
| `PEEK` | Notifikasi/event singkat | Ekspansi sementara; tidak merebut kontrol dari EXPANDED. |
| `HIDDEN` | Fullscreen sesuai Smart Adaptive | Island tidak terlihat dan tidak mengambil input secara tidak sengaja. |

### 5.2 Transisi dan arbitrasinya

1. `COMPACT + hover -> PREVIEW`; `PREVIEW + pointer leave -> COMPACT` setelah *debounce* yang dapat disesuaikan.
2. `COMPACT/PREVIEW + click -> EXPANDED`; `EXPANDED + click outside/Escape -> COMPACT`.
3. `COMPACT + allowed notification -> PEEK`; `PEEK + timeout -> COMPACT`; PEEK tidak mengganti EXPANDED.
4. `fullscreen begins -> HIDDEN` **kecuali** ada interaksi yang secara eksplisit masih diizinkan oleh aturan compositor; default MVP adalah HIDDEN.
5. `fullscreen ends -> COMPACT` dengan snapshot terakhir; event lama tidak memicu PEEK tertunda.
6. Jika backend putus, state UI tidak otomatis crash; kontrol media dinonaktifkan dan visual fallback ditampilkan.
7. Animasi state yang sedang berlangsung dibatalkan atau dialihkan dengan transisi tunggal, bukan menumpuk tween tak terbatas.

### 5.3 Context-aware priority

Urutan keputusan yang diusulkan: **fullscreen visibility policy > active user interaction > notification policy > passive media changes**. Ini bukan klasifikasi keamanan; aturan notifikasi mendesak tetap mengikuti kebijakan GNOME dan tidak memaksa bypass fullscreen atau Do Not Disturb.

### 5.4 Respons interaksi yang dapat diukur

- Target desain (harus diuji): hover preview terpicu dengan latensi yang tidak tampak mengganggu dan animasi mencapai target 60 Hz pada perangkat uji standar.
- Tidak menggunakan synchronous D-Bus call di jalur input/animasi.
- Dukungan keyboard, escape dismiss, click outside dalam actor tree GNOME Shell, dan penghormatan terhadap preferensi reduced motion.

## 6. D-Bus Contract v1

### 6.1 Identitas layanan

- **Bus:** session bus, tanpa system bus atau hak root.
- **Well-known name:** `io.github.linuxisland.Core` (namespace sementara hingga pemilik proyek final).
- **Object path:** `/io/github/linuxisland/Core`.
- **Interface:** `io.github.linuxisland.Core1`.
- **Contract version:** `schemaVersion = 1`; perubahan tidak kompatibel memakai interface baru (`Core2`), tidak mengubah signature `Core1` secara diam-diam.
- **Source of truth:** skema XML introspection disimpan sebagai dokumen spesifikasi dan diverifikasi pada build/test implementasi.

### 6.2 XML introspection yang diusulkan

```xml
<node>
  <interface name="io.github.linuxisland.Core1">
    <method name="GetSnapshot">
      <arg name="snapshot" type="a{sv}" direction="out"/>
    </method>
    <method name="GetMediaState">
      <arg name="media" type="a{sv}" direction="out"/>
    </method>
    <method name="ControlMedia">
      <arg name="action" type="s" direction="in"/>
      <arg name="accepted" type="b" direction="out"/>
    </method>
    <method name="SetActivePlayer">
      <arg name="playerId" type="s" direction="in"/>
      <arg name="accepted" type="b" direction="out"/>
    </method>
    <method name="GetSettings">
      <arg name="settings" type="a{sv}" direction="out"/>
    </method>
    <method name="UpdateSettings">
      <arg name="changes" type="a{sv}" direction="in"/>
      <arg name="settingsRevision" type="t" direction="out"/>
    </method>
    <signal name="MediaChanged">
      <arg name="revision" type="t"/>
      <arg name="media" type="a{sv}"/>
    </signal>
    <signal name="SettingsChanged">
      <arg name="revision" type="t"/>
      <arg name="settings" type="a{sv}"/>
    </signal>
    <signal name="CoreStatusChanged">
      <arg name="status" type="s"/>
    </signal>
  </interface>
</node>
```

**Semantik:** `accepted=true` berarti Core telah memvalidasi dan mengirim perintah media secara sah, **bukan** jaminan bahwa player sudah berhasil mengubah state. Kebenaran akhir berasal dari MPRIS `PropertiesChanged`/`Seeked` atau refresh snapshot.

### 6.3 Snapshot schema (`a{sv}`)

| Key | D-Bus type | Penjelasan |
|---|---|---|
| `schemaVersion` | `u` | Versi format data, v0.1 = 1 |
| `instanceId` | `s` | ID proses Core yang berubah setiap restart |
| `status` | `s` | `ready`, `degraded`, `starting` |
| `mediaRevision` | `t` | Revisi monotonic per instance untuk media |
| `settingsRevision` | `t` | Revisi monotonic per instance untuk settings |
| `media` | `a{sv}` (di dalam variant) | Snapshot media aktif |
| `settings` | `a{sv}` (di dalam variant) | Settings efektif |
| `capabilities` | `as` | Daftar fitur saat ini |

### 6.4 Media state schema (`a{sv}`)

| Key | Tipe | Aturan |
|---|---|---|
| `playerId` | `s` | Service ID MPRIS; kosong bila tidak ada |
| `title` | `s` | Kosong bila metadata tidak tersedia |
| `artist` | `s` | Nama artis yang telah dinormalisasi |
| `albumArtUri` | `s` | URI tervalidasi atau kosong |
| `playbackStatus` | `s` | `Playing`, `Paused`, `Stopped` |
| `positionUs` | `x` | Mikrodetik, nonnegatif |
| `durationUs` | `x` | Mikrodetik, `0` jika tidak diketahui |
| `canPlay` | `b` | Capability MPRIS |
| `canPause` | `b` | Capability MPRIS |
| `canNext` | `b` | Capability MPRIS |
| `canPrevious` | `b` | Capability MPRIS |
| `canSeek` | `b` | Capability MPRIS |
| `rate` | `d` | Kecepatan playback, default `1.0` |
| `revision` | `t` | Media revision sama dengan signal terbaru |

- `ControlMedia` hanya menerima `PlayPause`, `Next`, `Previous` pada v0.1; kontrol yang tidak didukung menghasilkan `UnsupportedAction`.
- Pemilihan player otomatis: pakai preferensi tersimpan bila masih tersedia; jika tidak, pilih player yang sedang Playing; bila tidak ada, pilih service pertama yang stabil menurut urutan nama service. Pilihan selalu diekspos pada UI Settings.
- Perubahan `Position` MPRIS **tidak** memancarkan PropertiesChanged terus-menerus. UI mengestimasi progres dari timestamp + playback rate; sinkronisasi pada `Seeked`, perubahan playback, pergantian track, serta saat membuka panel.
- Tidak mengasumsikan seluruh browser atau aplikasi musik mengekspos MPRIS pada semua distribusi.

### 6.5 Settings schema (`a{sv}`)

| Key | Tipe | Nilai/aturan MVP |
|---|---|---|
| `theme` | `s` | `system`, `light`, `dark` |
| `capsuleSize` | `s` | `small`, `medium`, `large` |
| `animationEnabled` | `b` | Default `true`, tunduk pada preferensi aksesibilitas |
| `hoverPreviewEnabled` | `b` | Default `true` |
| `notificationPeekEnabled` | `b` | Default `false` sampai tidak ada popup ganda yang dibuktikan pada target GNOME |
| `smartAdaptiveEnabled` | `b` | Default `true` |
| `preferredPlayerId` | `s` | Kosong = automatic |
| `displayMode` | `s` | MVP hanya menerima `dynamic`; `floating`/`integrated` reserved untuk rilis selanjutnya |

- `GetSettings` mengembalikan settings efektif; `UpdateSettings` menerapkan seluruh perubahan secara atomik setelah validasi. Key tidak dikenal ditolak, bukan diam-diam diabaikan.
- Penyimpanan lokal di bawah `$XDG_CONFIG_HOME` melalui QSettings INI atau penyimpanan setara yang atomic-safe; tidak memerlukan daemon root.
- Perubahan settings sukses memicu `SettingsChanged` setelah persistence berhasil. Jika penyimpanan gagal, Core mengembalikan error dan mempertahankan settings sebelumnya.

### 6.6 Error contract

| Error suffix | Situasi |
|---|---|
| `InvalidArgument` | Parameter/setting tidak valid |
| `UnsupportedAction` | Media action/mode tidak didukung |
| `PlayerUnavailable` | Player yang dituju sudah hilang |
| `SettingsWriteFailed` | Gagal menyimpan konfigurasi |
| `NotReady` | Core belum siap melakukan operasi |
| `IncompatibleVersion` | Client mengharapkan skema berbeda |

Nama lengkap memakai prefix `io.github.linuxisland.Error.`. Error tidak mengungkap path pribadi, isi notifikasi, atau detail sensitif dalam pesan pengguna akhir.

### 6.7 Urutan startup, sinkronisasi, reconnect

1. Extension inisialisasi UI lokal dan menampilkan kondisi fallback bila Core belum ada.
2. Extension membuat `Gio.DBusProxy` secara asynchronous, memasang handler signal/name-owner; baru kemudian menjalankan `GetSnapshot`.
3. Extension mencatat `instanceId` dan revision dari snapshot. Signal dengan revision lebih lama atau sama diabaikan.
4. Ketika name owner berubah, snapshot dan revisions lama dianggap invalid; extension reconnect dan mengambil snapshot baru.
5. Jika beberapa signal datang di sela proses bootstrap, ambil snapshot terbaru / bandingkan revision per instance untuk menghindari *lost update*.
6. Ketika `UpdateSettings` sukses, Core memancarkan signal dengan revision baru; settings app dan extension menyinkronkan tampilan.
7. `CoreStatusChanged` hanya berlaku saat Core hidup. Kematian mendadak dikenali dari hilangnya D-Bus name owner, **bukan** mengandalkan signal crash.

## 7. Data flow

### 7.1 Media

```text
Media player -- MPRIS2 PropertiesChanged / Seeked --> Core.MediaService
Core.MediaService -- normalized MediaState --> EventNormalizer
EventNormalizer -- MediaChanged --> Extension.CoreProxy
Extension.CoreProxy -- state update --> IslandController / Renderer

Island.MediaButton -- ControlMedia(action) --> Core.MediaService
Core.MediaService -- MPRIS action --> Media player
[actual player state change] --> MPRIS2 --> Core --> Extension
```

Album art tidak boleh memicu network fetch yang tidak tervalidasi dari dalam GNOME Shell. Skema URI, ukuran sumber, dan fallback placeholder harus diperiksa. Remote artwork dapat dinonaktifkan pada MVP bila permukaan risiko belum diuji.

### 7.2 Notifications

```text
Application --> GNOME notification service --> GNOME Shell notification UI
                                           \--> NotificationAdapter (when safe)
                                                 --> Island PEEK (non-duplicate)
```

- GNOME adalah notification server; **jangan** mengklaim `org.freedesktop.Notifications`, menyadap seluruh bus tanpa kebutuhan, atau menghapus notifikasi native secara generik.
- Notifikasi native tetap tampil bila adapter tidak kompatibel atau kebijakan Do Not Disturb/fullscreen melarang peek.
- Preview di Island **opt-in/disabled by default pada MVP** sampai prototipe membuktikan penghindaran duplikasi yang stabil.
- Jangan menyalin isi notifikasi ke log/disk; data notifikasi sensitif dibatasi di proses Extension dan dibuang ketika tidak diperlukan.

### 7.3 Settings

```text
Qt/QML Settings UI --> UpdateSettings(a{sv}) --> Core.SettingsService
                     <-- new settingsRevision / error --
Core.SettingsService --> SettingsChanged --> GNOME Extension + Settings UI
```

## 8. Smart Adaptive, display, dan input

- GNOME Extension menggunakan API GNOME/Mutter untuk mengamati window fullscreen pada monitor utama; perubahan event lebih diutamakan daripada polling.
- Widget Island adalah actor GNOME Shell; tidak memanfaatkan overlay Qt mandiri untuk GNOME Wayland v0.1.
- Tidak mencoba membaca semua input global lewat API terlarang Wayland. *Click outside* diproses pada interaksi yang tersedia dalam GNOME Shell actor/stage sesuai aturan event propagation yang valid.
- Jika fullscreen detection gagal, jangan menampilkan overlay agresif di atas aplikasi; kembalikan mode yang aman dan catat warning non-sensitif.
- Mode `floating` dan `integrated` ditandai tidak tersedia pada UI v0.1, bukan menawarkan tombol yang tidak berfungsi.

## 9. Keamanan, privasi, dan resource lifecycle

- Semua pesan D-Bus dari aplikasi lokal pada session bus **harus dianggap tidak tepercaya**, termasuk string settings dan player ID.
- Batasi ukuran payload, validasi enum, escape teks UI, dan jangan menggunakan input dari D-Bus sebagai shell command atau path arbitrer.
- Art URI tidak boleh membuka file tidak tepercaya atau men-trigger unduhan otomatis tanpa kebijakan validasi; gunakan placeholder apabila gagal.
- Extension tidak menyimpan isi notifikasi, tidak mengirim telemetri, dan tidak meminta privilese tambahan.
- Saat `disable()`, extension harus melepas signal handler, timers, actors, dan D-Bus proxy; saat Core berhenti, UI masuk fallback dengan kontrol yang disabled.
- Layanan systemd user-level (bila dipakai) boleh menggunakan restart on failure dengan pembatasan restart; ekstensi tidak melakukan loop restart agresif.

## 10. Error handling dan recovery

| Failure scenario | Required behavior |
|---|---|
| Core process exits/crashes | Extension tetap hidup, media controls disabled, name-owner watch melakukan reconnect. |
| Core restarts | ID instance baru -> seluruh cache invalid -> fresh snapshot. |
| MPRIS player disappears | Media state kosong; UI aman; tidak ada stale button action. |
| D-Bus call timeout | UI tidak freeze; pesan error minimal; retry hanya jika aman/idempotent. |
| Invalid settings | Operasi gagal atomik; settings lama tidak berubah. |
| Notification integration incompatible | Gunakan notifikasi native GNOME; Island PEEK disabled. |
| Fullscreen detection unreliable | Hindari overlay yang mengganggu dan tandai fitur degradasi. |
| Extension disabled | Hapus actor, listener, timeout, dan referensi objek. |

## 11. Struktur repository (rancangan, belum dibuat)

```text
linux-island/
  CMakeLists.txt
  LICENSE
  README.md
  core/
    app/
    dbus/
    media/
    settings/
    events/
  extension/
    metadata.json
    extension.js
    lib/
      islandController.js
      coreProxy.js
      gnomeDisplayAdapter.js
      notificationAdapter.js
    ui/
  settings-app/
    main.cpp
    qml/
  schemas/
    io.github.linuxisland.Core1.xml
  tests/
    unit/
    integration/
    extension/
  packaging/
    systemd-user/
  docs/
    superpowers/specs/
```

Semua file pada struktur ini adalah **usulan layout**, bukan pernyataan bahwa file implementasinya sudah tersedia.

## 12. Test strategy dan acceptance criteria

### 12.1 Unit tests

- Validasi Settings (enum, type, batas ukuran, atomic rollback).
- Normalisasi MPRIS metadata (metadata kosong, invalid URI, multiple player).
- Event revisions, coalescing, dan prioritas state controller.
- D-Bus adaptor serialisasi/deserialisasi sesuai introspection XML.

### 12.2 Integration tests

- `GetSnapshot`, `GetMediaState`, `ControlMedia`, `SetActivePlayer`, `GetSettings`, `UpdateSettings` sesuai signature.
- `MediaChanged`, `SettingsChanged`, serta error D-Bus yang diproyeksikan dengan benar.
- Core crash/restart, `instanceId` berubah, extension reconnect tanpa freeze.
- Media test menggunakan fake MPRIS service dan player nyata yang kompatibel.
- GNOME extension enable/disable berulang tanpa listener/actor tertinggal.

### 12.3 Manual acceptance (Ubuntu GNOME Wayland)

| ID | Skenario | Kriteria lulus |
|---|---|---|
| AC-01 | Desktop idle | COMPACT tersedia, tidak mengganggu panel. |
| AC-02 | Hover | PREVIEW muncul dan kembali dengan benar. |
| AC-03 | Click | EXPANDED interaktif; klik di luar/Escape menutup. |
| AC-04 | MPRIS | Metadata dan controls bekerja pada minimal satu player test yang diketahui kompatibel. |
| AC-05 | Notification | Native notification tetap bekerja; jika Island preview aktif, tidak ada popup ganda. |
| AC-06 | Fullscreen | Island tersembunyi dan pulih sesuai Smart Adaptive. |
| AC-07 | Settings | Perubahan tema/ukuran tersimpan dan dipantulkan tanpa Shell restart. |
| AC-08 | Recovery | Core dihentikan/dijalankan kembali tanpa crash GNOME Shell. |
| AC-09 | Compatibility | Extension enable/disable pada GNOME baseline tanpa error blocker. |
| AC-10 | Performance | Tidak ada UI stall yang signifikan; hasil pengukuran dilaporkan sebelum rilis. |

**Release gate:** AC-01 hingga AC-04, AC-06 hingga AC-09 wajib lulus. AC-05 wajib membuktikan tidak mengganggu notifikasi native; optional peek boleh tetap nonaktif. AC-10 memerlukan pengukuran baseline sebelum menetapkan batas kuantitatif final.

## 13. Observability

- Gunakan logging dengan level `error/warn/info/debug`; debug hanya ketika diaktifkan secara eksplisit.
- Log peristiwa lifecycle, D-Bus reconnect, error dari MPRIS, Settings write failure, dan compatibility detection.
- Jangan log metadata lagu atau isi notifikasi secara default.
- Distribusi debugging: GNOME Shell journal, user service journal, dan diagnostic command yang tidak memerlukan hak root.

## 14. Risks, mitigations, dan validasi awal

| Risiko | Dampak | Mitigasi |
|---|---|---|
| GNOME Shell internal API berubah | Extension rusak di rilis baru | Compatibility matrix + smoke test per versi GNOME |
| Shell extension bug | Sesi desktop tidak stabil | Kode extension kecil, cleanup disiplin, error boundaries |
| Duplikasi notifikasi | Gangguan UX | Preview disabled by default; native fallback |
| Media app tidak mendukung MPRIS | Fitur media tidak aktif | Capability detection dan empty state |
| Wayland fullscreen/panel berbeda | Display tidak konsisten | Adapter spesifik desktop dan pengujian per compositor |
| Core IPC race saat restart | UI stale | Instance ID + monotonic revisions + fresh snapshot |
| Artwork URI tidak aman | Privasi/kinerja | Validasi dan placeholder, nonblocking processing |
| Scope creep 7 fitur | Rilis tertunda | Kunci MVP media + UI + settings + safe notifications |

### Validasi teknis sebelum implementasi penuh

1. Uji GNOME Shell actor yang mengikuti posisi panel dan menghormati fullscreen.
2. Uji `Gio.DBusProxy` asynchronous dan reconnection ke fake Core service.
3. Uji pengamatan notifikasi yang tidak memerlukan takeover service maupun popup duplikat; bila gagal, tampilkan native notification saja pada v0.1.
4. Uji fake MPRIS service + satu player nyata.
5. Uji extension enable/disable berkali-kali sebelum menambah fitur UI.

## 15. Milestone desain dan urutan implementasi setelah persetujuan

- **M0 — Compatibility spike:** GNOME Wayland capsule, fullscreen visibility, extension lifecycle.
- **M1 — Core IPC:** service Qt D-Bus, introspection XML, snapshot, reconnect.
- **M2 — Media MVP:** MPRIS discovery/control, normalized media state, data display.
- **M3 — UI interaction:** lima state, Smart Adaptive, hybrid hover/click, minimal animation.
- **M4 — Settings & Notifications:** validated settings, Qt/QML settings UI, safe notification integration.
- **M5 — Quality & packaging:** integration test, manual acceptance, release notes, install/uninstall.

Milestone adalah urutan pekerjaan, **bukan janji durasi**. Rencana implementasi rinci hanya disusun setelah dokumen desain ini ditinjau dan disetujui.

## 16. Keputusan tertunda dan batas non-blocking

1. **Ubuntu/GNOME exact version:** gunakan baseline yang diusulkan untuk mulai uji; tambahkan versi aktual developer sebelum menyatakan kompatibilitas rilis.
2. **Namespace D-Bus final:** ganti namespace sementara setelah nama organisasi/akun repositori ditentukan; gunakan namespace yang konsisten pada service dan packaging.
3. **GNOME notification hook:** bergantung pada proof of concept per versi; tidak boleh menjadi blocker untuk notifikasi native.
4. **Floating / Integrated Mode:** tidak termasuk v0.1; kompatibilitas dan mode switching dirancang sebagai fase terpisah.
5. **Distribusi paket dan lisensi:** diputuskan sebelum public release, bukan sebagai syarat implementasi awal.

## 17. Sumber primer dan referensi teknis

1. GNOME JavaScript — Extensions Architecture: https://gjs.guide/extensions/overview/architecture.html
2. GNOME JavaScript — Notifications: https://gjs.guide/extensions/topics/notifications.html
3. GNOME JavaScript — ES Modules: https://gjs.guide/extensions/overview/imports-and-modules.html
4. Qt 6 — Using D-Bus Adaptors: https://doc.qt.io/qt-6/usingadaptors.html
5. MPRIS D-Bus Interface Specification: https://specifications.freedesktop.org/mpris/latest/
6. MPRIS Player Interface (Position, Seeked, capability): https://specifications.freedesktop.org/mpris/latest/Player_Interface.html
7. Desktop Notifications Specification v1.3: https://specifications.freedesktop.org/notification/latest-single/
8. Gio.DBusProxy — GNOME GLib: https://docs.gtk.org/gio/class.DBusProxy.html
9. Ubuntu 24.04 LTS Release Notes (GNOME 46): https://documentation.ubuntu.com/release-notes/24.04/
10. Qt 6 — QSettings, atomic synchronization: https://doc.qt.io/qt-6/qsettings.html

---

**Review requested:** Pastikan cakupan MVP, baseline GNOME, dan strategi notifikasi sesuai tujuan. Setelah disetujui, dokumen ini menjadi dasar implementation plan, bukan kode yang sudah diimplementasikan.
