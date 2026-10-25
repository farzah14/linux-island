// System metrics collector (CPU, RAM, Battery) for Linux Island (v0.2)
// Uses passive /proc and /sys file reads via GLib in GJS, with fallback for pure logic tests.

let GLibModule = null;
try {
    if (typeof imports !== 'undefined' && imports.gi && imports.gi.GLib) {
        GLibModule = imports.gi.GLib;
    }
} catch {
    // Node.js or environment without global imports
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

function defaultReadFile(filePath) {
    if (GLibModule) {
        try {
            const [ok, bytes] = GLibModule.file_get_contents(filePath);
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
        this._batteryPath = null;
        this._detectBatteryPath();
    }

    _detectBatteryPath() {
        for (const name of ['BAT0', 'BAT1', 'macsmc-battery']) {
            const path = `/sys/class/power_supply/${name}/capacity`;
            try {
                const res = this._readFile(path);
                if (res !== null && !isNaN(parseInt(res.trim(), 10))) {
                    this._batteryPath = `/sys/class/power_supply/${name}`;
                    return;
                }
            } catch {
                // Next path
            }
        }
        this._batteryPath = null;
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
                        text: `${Math.round(pct)}%`,
                    };
                } else {
                    cpuData = {
                        percent: 0,
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
                    usedGb: mem.usedGb,
                    totalGb: mem.totalGb,
                    text: `${mem.usedGb.toFixed(1)}/${mem.totalGb.toFixed(1)}G`,
                };
            }
        } catch {
            ramData = null;
        }

        // Battery
        let batData = null;
        if (this._batteryPath) {
            try {
                const capStr = this._readFile(`${this._batteryPath}/capacity`);
                const statusStr = this._readFile(`${this._batteryPath}/status`);
                const bat = parseBattery(capStr, statusStr);
                if (bat) {
                    batData = {
                        percent: bat.percent,
                        status: bat.status,
                        isCharging: bat.isCharging,
                        text: `${bat.percent}%`,
                    };
                }
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
