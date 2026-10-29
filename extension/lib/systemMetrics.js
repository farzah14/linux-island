// System metrics collector (CPU, RAM, Battery) for Linux Island (v0.2)
// Uses passive /proc and /sys file reads via GLib in GJS, with fallback for pure logic tests.

let GLib = null;
let Gio = null;
if (typeof process === 'undefined') {
    try {
        GLib = (await import('gi://GLib')).default;
    } catch (_) {}
    try {
        Gio = (await import('gi://Gio')).default;
    } catch (_) {}
}

export function parseCpuStat(content) {
    if (!content || typeof content !== 'string') return null;
    const firstLine = content.split('\n')[0].trim();
    if (!firstLine.startsWith('cpu ')) return null;

    const parts = firstLine.split(/\s+/).slice(1).map(Number);
    if (parts.length < 4 || parts.some(isNaN)) return null;

    // CPU fields: user, nice, system, idle, iowait, irq, softirq, steal, guest, guest_nice
    const user = parts[0] || 0;
    const nice = parts[1] || 0;
    const system = parts[2] || 0;
    const idleTime = parts[3] || 0;
    const iowait = parts[4] || 0;
    const irq = parts[5] || 0;
    const softirq = parts[6] || 0;
    const steal = parts[7] || 0;

    const idle = idleTime + iowait;
    const work = user + nice + system + irq + softirq + steal;
    const total = idle + work;

    return { idle, work, total };
}

export function computeCpuPercent(prev, curr) {
    if (!prev || !curr || typeof prev !== 'object' || typeof curr !== 'object') {
        return null;
    }
    const deltaTotal = curr.total - prev.total;
    const deltaWork = curr.work - prev.work;

    if (deltaTotal <= 0) {
        return 0.0;
    }

    const pct = (deltaWork / deltaTotal) * 100.0;
    return Math.max(0.0, Math.min(100.0, Math.round(pct * 10) / 10));
}

export function parseMeminfo(content) {
    if (!content || typeof content !== 'string') return null;

    let totalKb = null;
    let availableKb = null;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; ++i) {
        const line = lines[i];
        if (line.startsWith('MemTotal:')) {
            const match = line.match(/MemTotal:\s+(\d+)\s+kB/);
            if (match) totalKb = parseInt(match[1], 10);
        } else if (line.startsWith('MemAvailable:')) {
            const match = line.match(/MemAvailable:\s+(\d+)\s+kB/);
            if (match) availableKb = parseInt(match[1], 10);
        }
        if (totalKb !== null && availableKb !== null) break;
    }

    if (totalKb === null || availableKb === null || totalKb <= 0) {
        return null;
    }

    const usedKb = Math.max(0, totalKb - availableKb);
    const percent = Math.round((usedKb / totalKb) * 1000) / 10;
    const totalGb = Math.round((totalKb / 1048576) * 10) / 10;
    const usedGb = Math.round((usedKb / 1048576) * 10) / 10;

    return {
        totalKb,
        availableKb,
        usedKb,
        percent,
        totalGb,
        usedGb,
    };
}

export function parseBattery(capacityContent, statusContent) {
    if (!capacityContent || typeof capacityContent !== 'string') return null;
    const capNum = parseInt(capacityContent.trim(), 10);
    if (isNaN(capNum) || capNum < 0 || capNum > 100) return null;

    const status = (statusContent && typeof statusContent === 'string')
        ? statusContent.trim()
        : 'Unknown';

    const isCharging = (status === 'Charging');

    return {
        percent: capNum,
        status,
        isCharging,
    };
}

export function getBatteryIconName(percent, isCharging) {
    if (isCharging) {
        return 'battery-charging-symbolic';
    }
    const p = Number(percent) || 0;
    if (p >= 90) return 'battery-full-symbolic';
    if (p >= 60) return 'battery-good-symbolic';
    if (p >= 30) return 'battery-low-symbolic';
    return 'battery-caution-symbolic';
}

export function parseNetDev(content) {
    if (!content || typeof content !== 'string') return null;
    const lines = content.split('\n');
    let totalRx = 0;
    let totalTx = 0;
    let found = false;

    for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        const iface = line.slice(0, colonIdx).trim();
        if (iface === 'lo') continue;

        const fields = line.slice(colonIdx + 1).trim().split(/\s+/).map(Number);
        if (fields.length >= 9) {
            const rx = fields[0];
            const tx = fields[8];
            if (!isNaN(rx) && !isNaN(tx)) {
                totalRx += rx;
                totalTx += tx;
                found = true;
            }
        }
    }

    if (!found) return null;
    return { rx: totalRx, tx: totalTx, total: totalRx + totalTx, timestamp: Date.now() };
}

export function formatNetSpeed(bytesPerSec) {
    if (typeof bytesPerSec !== 'number' || isNaN(bytesPerSec) || bytesPerSec <= 0) {
        return '0 B/s';
    }
    if (bytesPerSec < 1024) {
        return `${Math.round(bytesPerSec)} B/s`;
    }
    const kb = bytesPerSec / 1024;
    if (kb < 1024) {
        return `${kb >= 100 ? Math.round(kb) : kb.toFixed(1)} KB/s`;
    }
    const mb = kb / 1024;
    if (mb < 1024) {
        return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB/s`;
    }
    const gb = mb / 1024;
    return `${gb.toFixed(1)} GB/s`;
}

export function formatStorage(bytes) {
    const value = Number(bytes);
    if (!isFinite(value) || value <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let amount = value;
    let unit = 0;
    while (amount >= 1024 && unit < units.length - 1) {
        amount /= 1024;
        unit++;
    }
    const rounded = amount >= 100 ? Math.round(amount) : amount.toFixed(1);
    return `${rounded} ${units[unit]}`;
}

/**
 * Compact "used/total unit" form for the narrow disk column, e.g. "36/143 GB".
 * The unit is printed once so the string stays short enough not to clip.
 */
export function formatStorageCompact(usedBytes, totalBytes) {
    const total = Number(totalBytes);
    if (!isFinite(total) || total <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let amount = total;
    let unit = 0;
    while (amount >= 1024 && unit < units.length - 1) {
        amount /= 1024;
        unit++;
    }
    const scale = 1024 ** unit;
    const totalValue = amount >= 100 ? Math.round(amount) : amount.toFixed(1);
    const usedValue = total / scale >= 100
        ? Math.round(Number(usedBytes) / scale)
        : (Number(usedBytes) / scale).toFixed(1);
    return `${usedValue}/${totalValue} ${units[unit]}`;
}

export function computeStorageUsage(sizeBytes, freeBytes) {
    const size = Number(sizeBytes);
    const free = Number(freeBytes);
    if (!isFinite(size) || size <= 0) return null;
    const clampedFree = isFinite(free) ? Math.max(0, Math.min(size, free)) : 0;
    const used = size - clampedFree;
    const percent = Math.max(0, Math.min(100, (used / size) * 100));
    return {
        size,
        free: clampedFree,
        used,
        percent,
        text: `${Math.round(percent)}%`,
        detailText: `${formatStorage(used)} / ${formatStorage(size)}`,
        // The system page's disk column is ~67px wide, which fits about 13
        // characters at 9px. Spell the total once and drop the redundant unit:
        // "36/143 GB" instead of "36.0 GB / 143 GB".
        compactDetailText: formatStorageCompact(used, size),
    };
}

export function storageIconName(percent) {
    const p = Number(percent) || 0;
    if (p >= 90) return 'drive-harddisk-solidstate-symbolic';
    return 'drive-harddisk-symbolic';
}

function defaultReadFile(filePath) {
    if (GLib) {
        try {
            const [ok, bytes] = GLib.file_get_contents(filePath);
            if (!ok || !bytes) return null;
            return new TextDecoder().decode(bytes);
        } catch {
            return null;
        }
    }
    return null;
}

export function defaultReadStorage(mountPath = '/') {
    if (!Gio) return null;
    try {
        const file = Gio.File.new_for_path(mountPath);
        const info = file.query_filesystem_info(
            'filesystem::size,filesystem::free', null);
        if (!info) return null;
        return {
            size: info.get_attribute_uint64('filesystem::size'),
            free: info.get_attribute_uint64('filesystem::free'),
        };
    } catch {
        return null;
    }
}

export class SystemMetricsCollector {
    constructor({ readFile = defaultReadFile, readStorage = defaultReadStorage } = {}) {
        this._readFile = readFile;
        this._readStorage = readStorage;
        this._lastCpuSample = null;
        this._lastNetSample = null;
        this._batteryPaths = [];
        this._detectBatteryPaths();
    }

    _detectBatteryPaths() {
        const candidates = ['BAT0', 'BAT1', 'BAT2', 'macsmc-battery'];
        const found = [];
        for (const name of candidates) {
            const path = `/sys/class/power_supply/${name}`;
            try {
                const res = this._readFile(`${path}/capacity`);
                if (res !== null && !isNaN(parseInt(res.trim(), 10))) {
                    found.push(path);
                }
            } catch {
                // Next path
            }
        }
        this._batteryPaths = found;
    }

    collect() {
        // CPU
        let cpuData = null;
        try {
            const statStr = this._readFile('/proc/stat');
            const currCpu = parseCpuStat(statStr);
            if (currCpu) {
                if (this._lastCpuSample) {
                    const pct = computeCpuPercent(this._lastCpuSample, currCpu);
                    cpuData = {
                        percent: pct,
                        iconName: 'preferences-system-performance-symbolic',
                        label: 'CPU',
                        text: `${Math.round(pct)}%`,
                    };
                } else {
                    cpuData = {
                        percent: 0,
                        iconName: 'preferences-system-performance-symbolic',
                        label: 'CPU',
                        text: '...%',
                    };
                }
                this._lastCpuSample = currCpu;
            }
        } catch {
            cpuData = null;
        }

        // RAM
        let ramData = null;
        try {
            const memStr = this._readFile('/proc/meminfo');
            const mem = parseMeminfo(memStr);
            if (mem) {
                ramData = {
                    percent: mem.percent,
                    iconName: 'drive-harddisk-symbolic',
                    label: 'RAM',
                    usedGb: mem.usedGb,
                    totalGb: mem.totalGb,
                    text: `${Math.round(mem.percent)}%`,
                };
            }
        } catch {
            ramData = null;
        }

        // Battery
        let batData = null;
        if (this._batteryPaths.length > 0) {
            try {
                let totalNow = 0;
                let totalFull = 0;
                let isCharging = false;
                let totalPctSum = 0;
                let validCount = 0;
                let statusStr = 'Discharging';

                for (const bPath of this._batteryPaths) {
                    const capStr = this._readFile(`${bPath}/capacity`);
                    const stat = this._readFile(`${bPath}/status`);
                    const s = stat ? stat.trim() : '';
                    if (s === 'Charging') {
                        isCharging = true;
                        statusStr = 'Charging';
                    } else if (s === 'Full' && statusStr !== 'Charging') {
                        statusStr = 'Full';
                    }

                    let enow = null;
                    let efull = null;
                    try {
                        enow = this._readFile(`${bPath}/energy_now`) || this._readFile(`${bPath}/charge_now`);
                        efull = this._readFile(`${bPath}/energy_full`) || this._readFile(`${bPath}/charge_full`);
                    } catch (_) {}
                    if (enow && efull && parseInt(efull, 10) > 0) {
                        totalNow += parseInt(enow, 10);
                        totalFull += parseInt(efull, 10);
                    }

                    if (capStr) {
                        const c = parseInt(capStr.trim(), 10);
                        if (!isNaN(c)) {
                            totalPctSum += c;
                            validCount++;
                        }
                    }
                }

                let finalPct = 0;
                if (totalFull > 0) {
                    finalPct = Math.round((totalNow / totalFull) * 100);
                } else if (validCount > 0) {
                    finalPct = Math.round(totalPctSum / validCount);
                }

                finalPct = Math.max(0, Math.min(100, finalPct));
                batData = {
                    percent: finalPct,
                    status: statusStr,
                    isCharging,
                    iconName: getBatteryIconName(finalPct, isCharging),
                    device: 'BAT',
                    text: isCharging ? `${finalPct}% ⚡` : `${finalPct}%`,
                };
            } catch {
                batData = null;
            }
        }

        // Network
        let netData = null;
        try {
            const netStr = this._readFile('/proc/net/dev');
            const currNet = parseNetDev(netStr);
            if (currNet) {
                if (this._lastNetSample && this._lastNetSample.timestamp) {
                    const dt = Math.max(0.1, (currNet.timestamp - this._lastNetSample.timestamp) / 1000);
                    const rxSpeed = Math.max(0, (currNet.rx - this._lastNetSample.rx) / dt);
                    const txSpeed = Math.max(0, (currNet.tx - this._lastNetSample.tx) / dt);
                    const totalSpeed = rxSpeed + txSpeed;

                    netData = {
                        rxSpeed,
                        txSpeed,
                        totalSpeed,
                        iconName: 'network-transmit-receive-symbolic',
                        label: 'NET',
                        rxText: `↓ ${formatNetSpeed(rxSpeed)}`,
                        txText: `↑ ${formatNetSpeed(txSpeed)}`,
                        text: formatNetSpeed(totalSpeed),
                    };
                } else {
                    netData = {
                        rxSpeed: 0,
                        txSpeed: 0,
                        totalSpeed: 0,
                        iconName: 'network-transmit-receive-symbolic',
                        label: 'NET',
                        rxText: '↓ 0 B/s',
                        txText: '↑ 0 B/s',
                        text: '0 B/s',
                    };
                }
                this._lastNetSample = currNet;
            }
        } catch {
            netData = null;
        }

        // Storage (root filesystem)
        let storageData = null;
        try {
            const raw = this._readStorage('/');
            const usage = raw ? computeStorageUsage(raw.size, raw.free) : null;
            if (usage) {
                storageData = {
                    ...usage,
                    iconName: storageIconName(usage.percent),
                    label: 'DISK',
                };
            }
        } catch {
            storageData = null;
        }

        return {
            cpu: cpuData,
            ram: ramData,
            battery: batData,
            network: netData,
            storage: storageData,
        };
    }
}
