import {
    SystemMetricTile,
    SystemMetricsRow,
} from '../../extension/ui/systemMetricTile.js';

function assert(condition, message = 'Assertion failed') {
    if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message ? message + ': ' : ''}expected ${expected}, got ${actual}`);
    }
}

// 1. Instantiation under presentation environment
{
    const tile = new SystemMetricTile({label: 'CPU'});
    assert(tile);
    tile.setValue('25%', 25);
    tile.destroy();
}

// 2. SystemMetricsRow with mock collector and mock scheduler
{
    let updates = 0;
    const mockCollector = {
        collect: () => {
            updates++;
            return {
                cpu: { text: '15%', percent: 15 },
                ram: { text: '4.2/16.0G', percent: 26 },
                battery: { text: '95%', percent: 95, status: 'Discharging' },
            };
        },
    };

    let timerCreated = false;
    let timerCancelled = false;
    const mockScheduler = {
        add: (ms, fn) => {
            timerCreated = true;
            return 123;
        },
        remove: (id) => {
            if (id === 123) timerCancelled = true;
        },
    };

    const row = new SystemMetricsRow({
        collector: mockCollector,
        scheduler: mockScheduler,
    });
    assert(row);

    row.update();
    assert(updates >= 1, 'collector called on update');

    row.destroy();
    assert(row._destroyed, 'row should be marked destroyed');
}

console.log('PASS: SystemMetricTile and SystemMetricsRow presentation tests');
