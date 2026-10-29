# Rencana Pengembangan Linux Island Tanpa Logout

> Untuk pelaksana: gunakan skill `executing-plans`, kerjakan satu langkah kecil per giliran sesuai AGENTS.md. Dokumen ini adalah rencana, bukan bukti implementasi atau penerimaan runtime.

**Tanggal:** 30 Oktober 2026  
**Status:** Draf rencana implementasi; kode belum diubah untuk menjalankan rencana ini.  
**Tujuan:** Memungkinkan pengembang mengubah dan menguji Linux Island tanpa keluar dari sesi desktop utama.  
**Arsitektur dasar:** GNOME Shell Extension untuk UI native, C++20/Qt6 Core untuk data dan settings, D-Bus Session Bus.  
**Teknologi:** GJS, GNOME Shell, Bash, Python standard library untuk pengujian tooling, CMake, systemd user services.

## 1. Definisi hasil yang dituju

Target utama adalah workflow pengembangan tanpa logout: perubahan kode terlihat dalam lingkungan GNOME pengujian, sementara aplikasi pada desktop utama tetap berjalan.

Target tambahan adalah reload terbatas pada Shell yang sama menggunakan loader pengembangan. Jalur ini bersifat eksperimental sampai lifecycle dan batas memorinya terbukti.

Tidak menjanjikan semua perubahan pada JavaScript, loader, GNOME, atau Mutter dapat dimuat ulang dalam proses Shell utama. Interpreter tidak menyediakan mekanisme umum untuk membuang seluruh modul JavaScript lama. Restart proses GNOME pengujian menjadi jalur pemulihan yang bersih.

| Komponen berubah | Tindakan yang direncanakan | Logout desktop utama |
|---|---|---|
| JavaScript extension | Restart proses GNOME pengujian | Tidak |
| CSS extension | Generate lalu muat ulang stylesheet target pengujian | Tidak |
| Core C++ | Build dan restart Core target | Tidak |
| Settings/QML | Build bila resource tertanam, lalu buka ulang proses | Tidak |
| Loader pengembangan | Restart proses GNOME pengujian | Tidak |
| Extension pada Shell utama | Reload terbatas bila lolos pembuktian; perubahan tertentu tetap memerlukan Shell baru | Tidak dapat dijamin |
| GNOME/Mutter | Lingkungan pengujian baru sesuai versi platform | Tidak untuk desktop utama yang tidak diubah |

## 2. Temuan awal dan keputusan yang diperlukan

Pemeriksaan sumber sebelum dokumen ini dibuat menemukan:

- `scripts/dev/dev-reload.sh` sudah ada sebagai file untracked. Pertahankan pekerjaan tersebut dan evaluasi sebelum mengubahnya.
- Script memakai loader `island-dev@local`, staging direktori berversi, dynamic import, dan disable/enable.
- `packaging/dev/install-local.sh` menyalin extension serta memasang Core dan UI. Penyalinan tidak membuktikan kode baru sudah aktif pada Shell.
- Terdapat perubahan lokal pada extension, QML, generator CSS, dan tes. Jangan reset, clean, atau menimpa perubahan tersebut.
- `gnome-shell --version` menghasilkan `GNOME Shell 50.1`, exit 0.
- `gnome-shell --help` menyediakan `--devkit`, `--headless`, dan `--virtual-monitor`, exit 0.
- `printenv XDG_SESSION_TYPE` menghasilkan `tty`, exit 0. Jenis sesi desktop utama belum dibuktikan oleh pemeriksaan ini.
- Target penerimaan resmi AGENTS.md tetap Ubuntu 24.04 / GNOME 46 / Wayland.

### Konflik arsitektur

`AGENTS.md:9` menetapkan GNOME Shell Extension GJS sebagai UI live. Sementara itu, `QT6_OVERLAY_STANDARDIZATION_PLAN.md:4` mengusulkan Qt overlay untuk semua desktop.

**Gate sebelum implementasi:** selesaikan konflik tersebut secara eksplisit. Dokumen ini menguraikan jalur GNOME sesuai arsitektur yang disetujui; tidak mengesahkan migrasi Qt. Permintaan membuat dokumen tidak merupakan persetujuan mengubah arsitektur atau memodifikasi Shell utama.

## 3. Perbandingan pendekatan

| Pendekatan | Kelebihan | Batas | Keputusan rencana |
|---|---|---|---|
| GNOME pengujian dengan proses terpisah | Kode dimuat bersih; sesi utama tetap berjalan | Hasil terlihat di desktop pengujian | Jalur utama |
| Loader dengan direktori berversi | Berpotensi menerapkan perubahan pada Shell yang sama | Modul lama, registrasi tipe, dan resource dapat bertahan | Eksperimen setelah jalur utama stabil |
| Qt overlay sebagai UI utama | Restart UI sebagai proses aplikasi | Perubahan arsitektur dan verifikasi integrasi Wayland | Di luar lingkup sampai disetujui |

Nested GNOME dan private D-Bus bukan sandbox keamanan penuh. Gunakan test user/VM untuk penerimaan runtime resmi dan hindari menulis konfigurasi desktop utama dari lingkungan nested.

## 4. Aturan pelaksanaan

- Baca `START_HERE.md`, runbook, milestone, dan prompt yang cocok sebelum mengubah kode.
- Kaitan milestone adalah `M5-19B`, instalasi developer yang reversible. Perluasan file tooling di bawah perlu dicatat sebagai ruang lingkup tambahan, bukan dianggap sudah ada pada kartu lama.
- Prompt acuan: `prompts/gemini-flash-v2/19-M5-packaging.md`.
- Periksa status Git dan batasi setiap langkah pada 2–6 file relevan.
- Pelihara semua pekerjaan lokal yang tidak terkait. Jangan commit otomatis, push, merge, atau tag.
- Untuk perubahan perilaku, tunjukkan RED yang relevan, implementasi minimal, lalu GREEN.
- Tidak ada sudo, instalasi paket sistem, atau perubahan Shell harian pada tahap dokumentasi ini.
- Operasi runtime utama harus diuji pada disposable test user/VM terlebih dahulu.
- Jangan mengubah kontrak Core1 atau token Warm Minimalist untuk kebutuhan reload.
- Jangan menganggap exit 0, service aktif, atau file sama sebagai bukti UI baru tampil.

## 5. Tahap A — audit target dan prasyarat

**File acuan:** `scripts/dev/dev-reload.sh`, `packaging/dev/install-local.sh`, `extension/extension.js`, `extension/metadata.json`, `docs/testing.md`.

- [ ] Periksa `git status --short` dan current branch; catat file yang sudah berubah.
- [ ] Periksa versi dan bantuan GNOME pada host target.
- [ ] Identifikasi frontend aktif, proses Core, lokasi instalasi, dan sesi bus yang digunakan.
- [ ] Periksa ketersediaan dependensi devkit/nested tanpa memasangnya otomatis.
- [ ] Periksa baseline proyek dengan perintah di bawah; catat output dan exit code sebenarnya.

```bash
bash scripts/dev/audit-environment.sh
python3 scripts/dev/verify-kit.py
node tests/extension/state-machine.test.js
python3 tests/integration/test_m0_scaffold.py
python3 design-system/qa/verify_tokens.py
```

**Kriteria selesai:** target proses dan lingkungan diketahui; kegagalan baseline dibedakan antara dependensi dan perilaku kode. Tahap berikutnya tidak boleh melewati gate gagal tanpa diagnosis.

## 6. Tahap B — sesi pengujian tanpa logout

**File yang diusulkan:**

- Buat `scripts/dev/dev-session.sh`: lifecycle proses pengujian.
- Buat `tests/integration/test_dev_session.py`: pengujian pemilihan versi dan pembatasan operasi dengan mock.
- Buat `docs/development-without-logout.md`: panduan operasional yang hanya mengklaim perilaku terverifikasi.

### Urutan kerja

- [ ] RED: uji bahwa GNOME 46 memilih `--nested`, sedangkan GNOME 50 memilih `--devkit`; versi tidak dikenal menghasilkan diagnosis.
- [ ] RED: uji bahwa stop hanya menargetkan proses milik runner dan tidak mengirim sinyal ke Shell utama.
- [ ] Buat runner minimal dengan konfigurasi/data pengujian terpisah dan D-Bus privat.
- [ ] Salin source extension ke lokasi pengujian; jangan timpa extension harian.
- [ ] Jalankan Core pengujian pada bus yang sama dengan Shell pengujian. Hindari service systemd user yang menunjuk sesi utama.
- [ ] Tambahkan penanganan exit dan cleanup proses turunan yang dimiliki runner.
- [ ] GREEN: jalankan tes mock lalu pengujian runtime pada test user/VM.

Perintah dasar menurut dokumentasi GNOME:

```bash
# GNOME 46–48
dbus-run-session gnome-shell --nested --wayland

# GNOME 49+
dbus-run-session gnome-shell --devkit --wayland
```

Perintah tersebut adalah referensi, bukan runner lengkap. Deteksi dependensi, staging, Core privat, dan cleanup harus tersedia sebelum dipakai sebagai workflow proyek.

**Kriteria selesai:** ubah JavaScript pada file utama dan satu modul impor, restart lingkungan pengujian, buktikan kedua perubahan dimuat, dan pastikan desktop utama tetap berjalan. GNOME 50.1 tidak menggantikan penerimaan GNOME 46.

## 7. Tahap C — evaluasi dan perkuat loader yang sudah ada

**File utama:** `scripts/dev/dev-reload.sh`, `extension/extension.js`; usulan tes `tests/integration/test_dev_reload.py` dan `tests/extension/dev-loader.test.js`.

| Temuan pada prototipe | Perilaku yang dibutuhkan |
|---|---|
| `enable()` melakukan pekerjaan async | Entrypoint lifecycle sinkron; pekerjaan async memiliki token generasi |
| Disable dapat mendahului selesainya import | Hasil generasi lama diabaikan dan resource dibersihkan |
| CSS dimuat sebelum import berhasil | Gagal import membatalkan CSS dan instance parsial |
| Delay tetap dan pemeriksaan `ACTIVE` | Tunggu kesiapan generasi yang benar dengan timeout |
| Tidak mencegah UI ganda | Deteksi frontend lain dan hentikan dengan diagnosis sebelum aktivasi |
| Hanya menyimpan beberapa direktori terbaru | Lindungi generasi aktif dan versi rollback; jangan hapus source yang masih diperlukan |
| Fallback staging ke `/tmp` | Validasi direktori runtime privat, kepemilikan, dan izin |
| Tidak memiliki lock | Serialisasi reload dan tolak operasi tumpang tindih |

- [ ] RED: simulasikan import gagal, disable saat import belum selesai, serta dua reload berdekatan.
- [ ] Audit registrasi GObject/GType, referensi modul, timer, signal handler, actor, dan subscription D-Bus sebelum menyatakan loader layak.
- [ ] Implementasikan satu perbaikan lifecycle per langkah, lalu GREEN untuk skenario tersebut.
- [ ] Tambahkan laporan generasi runtime. Jangan menambah method/signal ke kontrak Core1 hanya untuk tooling ini.
- [ ] Uji pengenalan loader pada sesi baru; jangan menjanjikan pemasangan loader baru selalu dikenali Shell yang sudah berjalan.
- [ ] Uji 20 siklus dan ukur baseline serta tren resource. Tetapkan batas berdasarkan pengukuran, bukan angka rekaan.

**Gate:** menghapus direktori staging tidak membuang modul dari interpreter. Jika terjadi benturan tipe, resource tertinggal, atau pertumbuhan tidak terkendali, tandai loader tidak layak untuk kasus tersebut dan gunakan restart Shell pengujian. Tidak ada janji reload tanpa batas.

## 8. Tahap D — satukan perintah developer

**Usulan file:** `scripts/dev/dev.sh`, `tests/integration/test_dev_cli.py`; ubah `docs/development-without-logout.md`.

Antarmuka berikut belum tersedia:

```bash
bash scripts/dev/dev.sh doctor
bash scripts/dev/dev.sh preview
bash scripts/dev/dev.sh reload extension
bash scripts/dev/dev.sh reload core
bash scripts/dev/dev.sh reload css
bash scripts/dev/dev.sh status
bash scripts/dev/dev.sh rollback
```

| Perintah | Kontrak perilaku |
|---|---|
| `doctor` | Pemeriksaan read-only, target dan dependensi terlihat |
| `preview` | Mulai lingkungan pengujian; tidak mengaktifkan UI utama |
| `reload extension` | Default restart Shell pengujian; loader hanya melalui pilihan eksplisit setelah lolos gate |
| `reload core` | Build lalu restart Core target; tunggu koneksi dan snapshot baru |
| `reload css` | Generate dari token canonical dan muat stylesheet target pengujian |
| `status` | Tampilkan target, generasi yang benar-benar siap, serta keadaan error |
| `rollback` | Aktifkan versi baik sebelumnya dan verifikasi kesiapan; bila gagal, hentikan target pengujian |

- [ ] RED: target ambigu ditolak sebelum mutasi; build gagal tidak menghentikan versi baik.
- [ ] RED: kesiapan kedaluwarsa tidak dianggap keberhasilan generasi baru.
- [ ] Implementasikan urutan validasi → staging → penerapan → kesiapan → verifikasi → pemulihan.
- [ ] GREEN: tes mock dan runtime terpisah; pesan sukses hanya setelah bukti kesiapan diterima.

Settings/QML yang tertanam dalam binary memerlukan rebuild, lalu restart proses Settings terkait. Perubahan data settings yang didukung kontrak existing menggunakan jalur sinkronisasi yang sudah ada.

## 9. Tahap E — watcher opsional

Kerjakan hanya setelah reload manual stabil. Gunakan fasilitas yang tersedia tanpa menambahkan dependency besar untuk kebutuhan sederhana.

- [ ] Gabungkan perubahan file yang berdekatan dan antrekan satu reload berikutnya jika diperlukan.
- [ ] Abaikan `build/`, log, `.git/`, dan direktori staging.
- [ ] Periksa sintaks sebelum menerapkan perubahan.
- [ ] Hentikan reload otomatis setelah kegagalan berulang dan tampilkan diagnosis.
- [ ] Jangan memilih Shell utama sebagai target otomatis.
- [ ] Uji penyimpanan cepat, file terhapus, syntax error, dan perubahan selama build berlangsung.

## 10. Matriks penerimaan

| Skenario | Bukti wajib |
|---|---|
| JS utama berubah | Penanda generasi runtime baru dan hasil perilaku berubah |
| Modul impor berubah | Hasil baru terlihat; bukan hanya file tersalin |
| CSS berubah | Bukti visual stylesheet baru |
| Core restart | UI reconnect dan menerima snapshot dari instance baru |
| Import/build gagal | Diagnosis jelas, tidak mengaku sukses, pemulihan terdokumentasi |
| Disable saat import berjalan | Tidak muncul actor setelah disable |
| Reload berulang | Tidak ada actor ganda atau callback berulang; tren resource dicatat |
| Rollback | Versi sebelumnya siap dan perilaku teramati |
| Desktop utama | Sesi tetap berjalan dan aplikasi utama tidak diterminasi runner |
| GNOME 46 Wayland | Bukti runtime pada test user/VM, terpisah dari host GNOME 50.1 |
| Fullscreen dan notifikasi | Kebijakan fullscreen tetap menang; banner native tidak diduplikasi |

Tes Node dan mock hanya memvalidasi logika tooling. Tes tersebut bukan bukti kompatibilitas GNOME atau keberhasilan visual.

## 11. Pelaporan dan pemulihan

Setiap langkah melaporkan: file berubah, perintah dan exit code, RED/GREEN aktual, versi lingkungan, batas yang belum diuji, serta langkah berikutnya. Pisahkan status source, build, file instalasi, kode termuat, dan bukti visual.

Saat gagal:

1. Hentikan percobaan reload berulang.
2. Catat tahap gagal dan identitas generasi tanpa teks notifikasi, metadata media, atau data rahasia.
3. Bersihkan hanya proses/resource milik target pengujian.
4. Pulihkan generasi baik sebelumnya jika memungkinkan.
5. Jika interpreter tidak lagi bersih, restart proses Shell pengujian.
6. Jangan mencoba memperbaiki dengan membunuh Shell utama.

## 12. Batas selesai dan urutan prioritas

Urutan: keputusan arsitektur → audit → sesi pengujian → pembuktian restart tanpa logout → evaluasi loader → CLI terpadu → watcher opsional.

Keberhasilan pertama yang wajib dibuktikan: perubahan `extension/ui/capsule.js` dan modul impornya terlihat dalam sesi GNOME pengujian tanpa logout dari desktop utama.

Keberhasilan jalur utama tidak bergantung pada kelayakan loader. Penerapan ke Shell harian merupakan tahap terpisah setelah bukti runtime dan persetujuan yang sesuai. Dokumen ini tidak mengesahkan install, build, restart service, atau mutasi desktop utama.

## 13. Referensi

- [GNOME: Reloading Extensions dan sesi nested/devkit](https://gjs.guide/extensions/development/debugging.html#reloading-extensions)
- [GNOME: Extension ESModule](https://gjs.guide/extensions/topics/extension.html)
- `AGENTS.md`
- `START_HERE.md`
- `docs/superpowers/plans/gemini-flash-v2/00-START-HERE.md`
- `docs/superpowers/plans/gemini-flash-v2/M5.md`
- `prompts/gemini-flash-v2/19-M5-packaging.md`

**Status pengujian dokumen:** perintah dan kriteria implementasi di atas belum dijalankan sebagai bagian dari implementasi rencana. Tidak ada klaim runtime PASS.
