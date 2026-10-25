// System metrics collector (CPU, RAM, Battery) for Linux Island (v0.2)
// Uses passive /proc and /sys file reads via GLib in GJS, with fallback for pure logic tests.

let GLib = null;
if (typeof process === 'undefined') {
    try {
        GLib = (await import('gi://GLib')).default;
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

export class SystemMetricsCollector {
    constructor({ readFile = defaultReadFile } = {}) {
        this._readFile = readFile;
        this._lastCpuSample = null;
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
                    text: `${mem.usedGb.toFixed(1)}/${mem.totalGb.toFixed(1)} GB`,
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
                    device: 'Battery Device',
                    text: isCharging ? `${finalPct}% ⚡` : `${finalPct}%`,
                };
            } catch {
                batData = null;
            }
        }

        return {
            cpu: cpuData,
            ram: ramData,
            battery: batData,
        };
    }
}
