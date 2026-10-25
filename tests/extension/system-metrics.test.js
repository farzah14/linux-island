import {
    parseCpuStat,
    computeCpuPercent,
    parseMeminfo,
    parseBattery,
    SystemMetricsCollector,
} from '../../extension/lib/systemMetrics.js';

function assert(condition, message = 'Assertion failed') {
    if (!condition) {
        throw new Error(message);
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message ? message + ': ' : ''}expected ${expected}, got ${actual}`);
    }
}

// 1. parseCpuStat
{
    const sample = 'cpu  1000 200 500 8000 100 0 50 0 0 0\ncpu0 500 100 250 4000 ...';
    const parsed = parseCpuStat(sample);
    assert(parsed, 'should parse valid /proc/stat');
    // idle = 8000 + 100 (idle + iowait) = 8100
    // work = 1000 + 200 + 500 + 0 + 50 + 0 (user + nice + system + irq + softirq + steal) = 1750
    // total = 8100 + 1750 = 9850
    assertEqual(parsed.idle, 8100);
    assertEqual(parsed.work, 1750);
    assertEqual(parsed.total, 9850);

    assertEqual(parseCpuStat(''), null, 'empty stat returns null');
    assertEqual(parseCpuStat('invalid cpu line'), null, 'invalid stat returns null');
}

// 2. computeCpuPercent
{
    const s1 = { idle: 8100, work: 1750, total: 9850 };
    const s2 = { idle: 8600, work: 2250, total: 10850 };
    // delta total = 1000, delta work = 500 => 50%
    const pct = computeCpuPercent(s1, s2);
    assertEqual(pct, 50.0);

    // Identical samples or invalid delta
    assertEqual(computeCpuPercent(s1, s1), 0.0);
    assertEqual(computeCpuPercent(null, s2), null);
    assertEqual(computeCpuPercent(s1, null), null);
}

// 3. parseMeminfo
{
    const memSample = `MemTotal:       16777216 kB
MemFree:         2097152 kB
MemAvailable:    8388608 kB
Buffers:          524288 kB
Cached:          4194304 kB`;

    const mem = parseMeminfo(memSample);
    assert(mem, 'should parse valid /proc/meminfo');
    assertEqual(mem.totalKb, 16777216);
    assertEqual(mem.availableKb, 8388608);
    assertEqual(mem.usedKb, 8388608);
    assertEqual(mem.percent, 50.0);
    assertEqual(mem.totalGb, 16.0);
    assertEqual(mem.usedGb, 8.0);

    assertEqual(parseMeminfo(''), null, 'empty meminfo returns null');
    assertEqual(parseMeminfo('NoMemTotal: 100 kB'), null, 'missing keys returns null');
}

// 4. parseBattery
{
    const bat1 = parseBattery('85\n', 'Discharging\n');
    assert(bat1);
    assertEqual(bat1.percent, 85);
    assertEqual(bat1.status, 'Discharging');
    assertEqual(bat1.isCharging, false);

    const bat2 = parseBattery('100\n', 'Full\n');
    assert(bat2);
    assertEqual(bat2.percent, 100);
    assertEqual(bat2.status, 'Full');

    const bat3 = parseBattery('42\n', 'Charging\n');
    assert(bat3);
    assertEqual(bat3.isCharging, true);

    assertEqual(parseBattery(null, null), null);
    assertEqual(parseBattery('invalid', 'status'), null);
}

// 5. SystemMetricsCollector with mock reader
{
    let statCount = 0;
    const mockFiles = {
        '/proc/stat': () => {
            statCount++;
            return statCount === 1
                ? 'cpu  1000 200 500 8000 100 0 50 0 0 0'
                : 'cpu  1200 200 600 8500 100 0 50 0 0 0';
        },
        '/proc/meminfo': () => `MemTotal:       16777216 kB\nMemAvailable:    8388608 kB`,
        '/sys/class/power_supply/BAT0/capacity': () => '92',
        '/sys/class/power_supply/BAT0/status': () => 'Discharging',
    };

    const collector = new SystemMetricsCollector({
        readFile: (path) => {
            if (mockFiles[path]) return mockFiles[path]();
            throw new Error(`File not found: ${path}`);
        },
    });

    // First collect initializes previous CPU sample
    const m1 = collector.collect();
    assert(m1.ram);
    assertEqual(m1.ram.percent, 50.0);
    assertEqual(m1.ram.text, '8.0/16.0 GB');
    assert(m1.battery);
    assertEqual(m1.battery.percent, 92);
    assertEqual(m1.battery.iconName, 'battery-full-symbolic');
    assertEqual(m1.battery.device, 'Battery');
    assert(m1.cpu);

    // Second collect calculates delta CPU
    const m2 = collector.collect();
    assertEqual(m2.cpu.percent, 37.5);
    assertEqual(m2.cpu.text, '38%');
}

console.log('PASS: system metrics parser, calculations and collector tests');
