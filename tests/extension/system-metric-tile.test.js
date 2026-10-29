import {
    SystemMetricTile,
    SystemMetricsRow,
    NetMonitorView,
    StorageIndicator,
    computeSystemColumns,
} from '../../extension/ui/systemMetricTile.js';
import {
    computeStorageUsage,
    formatStorage,
    formatStorageCompact,
    storageIconName,
} from '../../extension/lib/systemMetrics.js';

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
                network: { text: '1.2 MB/s', iconName: 'network-transmit-receive-symbolic', label: 'NET' },
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
    assertEqual(row._metricsCol, null, 'metrics row no longer owns a NET actor');
    row.destroy();
    assert(row._destroyed, 'row should be marked destroyed');
}

// 3. NET is centred on the island, with no rounded container.
{
    for (const contentWidth of [240, 300, 360]) {
        const cols = computeSystemColumns(contentWidth);
        assert(Math.abs(cols.netCentre - cols.pageCentre) < 0.51,
            `NET must sit on the page centre at ${contentWidth}px ` +
            `(net ${cols.netCentre}, page ${cols.pageCentre})`);
        assert(cols.metricsWidth > 0, 'metrics keep positive width');
        assert(cols.netWidth > 0, 'NET keeps positive width');
        assert(cols.metricsWidth >= cols.togglesWidth,
            'side columns leave room for the toggles');
        assert(Math.abs(cols.total - contentWidth) < 0.001,
            `columns must fill ${contentWidth}px, got ${cols.total}`);
    }
    // Narrow capsule: NET shrinks instead of pushing the toggles out.
    const tight = computeSystemColumns(90);
    assert(tight.netWidth >= 0, 'NET clamps at zero when space runs out');
    assert(tight.metricsWidth >= 0, 'metrics clamp at zero on narrow capsules');
    assert(tight.total <= 90.001, `narrow capsule still fits, got ${tight.total}`);

    // Real medium capsule: the card is 364px wide, i.e. 328px content plus
    // 18px padding per side. St's CSS width is the content box, so the System
    // page requests 328px and, minus its own 4px side padding, splits 320px
    // into 111px | 78px NET | 111px with two 10px gaps.
    const medium = computeSystemColumns(320);
    assert(Math.abs(medium.netCentre - 160) < 0.51, 'NET centred at medium size');
    assertEqual(medium.metricsWidth, 111, 'left slot spans the leftover half');
    assertEqual(medium.togglesWidth, 92, 'right group keeps its toggle budget');
    assertEqual(medium.netWidth, 78, 'NET keeps its full width at medium size');
    assert(Math.abs(medium.total - 320) < 0.001,
        'columns consume the full section content box, leaving no right dead space');
}

// 4. Network sample reaches the centre view, not the metrics column.
{
    const seen = [];
    const row = new SystemMetricsRow({
        collector: {
            collect: () => ({
                cpu: {text: '10%', percent: 10},
                ram: {text: '20%', percent: 20},
                battery: null,
                network: {rxText: '↓ 2.0 MB/s', txText: '↑ 300 KB/s', iconName: 'network-wireless-symbolic'},
            }),
        },
        scheduler: {add: () => 1, remove: () => {}},
        onNetwork: network => seen.push(network),
    });
    row.update();
    assertEqual(seen.length, 1, 'network emitted once per update');
    assertEqual(seen[0].rxText, '↓ 2.0 MB/s');
    row.destroy();

    const view = new NetMonitorView();
    view.setNetwork({rxText: '↓ 5 B/s', txText: '↑ 7 B/s'});
    assert(view, 'NetMonitorView constructs headlessly');
    view.destroy();
}

// 5. Storage usage math and formatting.
{
    const usage = computeStorageUsage(100 * 1024 ** 3, 40 * 1024 ** 3);
    assert(usage, 'storage usage computed');
    assertEqual(usage.percent, 60);
    assertEqual(usage.text, '60%');
    assertEqual(usage.used, 60 * 1024 ** 3);
    assertEqual(usage.detailText, '60.0 GB / 100 GB');
    // The system page's disk column is ~67px wide; the full string needs ~77px,
    // so the compact form must stay short enough to avoid clipping.
    assertEqual(usage.compactDetailText, '60/100 GB');
    assert(usage.compactDetailText.length <= 12,
        `compact disk text must fit the narrow column, got "${usage.compactDetailText}"`);
    assertEqual(formatStorageCompact(143 * 1024 ** 3, 250 * 1024 ** 3), '143/250 GB');
    assertEqual(formatStorageCompact(0, 0), '', 'zero total yields empty compact text');

    assertEqual(computeStorageUsage(0, 0), null, 'zero size yields null');
    assertEqual(computeStorageUsage(-1, 5), null, 'negative size yields null');
    const clamped = computeStorageUsage(1000, 5000);
    assertEqual(clamped.percent, 0, 'free above size clamps to zero used');

    assertEqual(formatStorage(0), '0 B');
    assertEqual(formatStorage(999), '999 B');
    assertEqual(formatStorage(1024), '1.0 KB');
    assertEqual(formatStorage(1024 ** 3), '1.0 GB');
    assertEqual(formatStorage(1024 ** 4 * 2), '2.0 TB');

    assertEqual(storageIconName(10), 'drive-harddisk-symbolic');
    assertEqual(storageIconName(95), 'drive-harddisk-solidstate-symbolic');
}

// 6. Collector reports storage through onStorage, not the metrics column.
{
    const seen = [];
    const row = new SystemMetricsRow({
        collector: {
            collect: () => ({
                cpu: null, ram: null, battery: null, network: null,
                storage: {percent: 61, text: '61%', detailText: '153 GB / 250 GB',
                    iconName: 'drive-harddisk-symbolic'},
            }),
        },
        scheduler: {add: () => 1, remove: () => {}},
        onStorage: storage => seen.push(storage),
    });
    row.update();
    assertEqual(seen.length, 1, 'storage emitted once per update');
    assertEqual(seen[0].percent, 61);
    row.destroy();

    const indicator = new StorageIndicator();
    indicator.setStorage({percent: 61, text: '61%', detailText: '153 GB / 250 GB',
        iconName: 'drive-harddisk-symbolic'});
    assertEqual(indicator.percent, 61);
    indicator.setStorage({percent: 96, text: '96%', detailText: '240 GB / 250 GB'});
    assertEqual(indicator.percent, 96);
    // No St in this headless run, so actor styling is asserted in
    // capsule-rendering.test.js where actor doubles exist.
    assertEqual(indicator.actor, null, 'headless run builds no actor');
    indicator.setWidth(67);
    assertEqual(indicator._labelWidth, undefined, 'setWidth is a no-op without an actor');
    indicator.destroy();
}

console.log('PASS: SystemMetricTile and SystemMetricsRow presentation tests');
