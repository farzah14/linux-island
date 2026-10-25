import {CarouselModel, FeatureCarousel} from '../../extension/ui/featureCarousel.js';

function assert(condition, message = 'Assertion failed') {
    if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message ? message + ': ' : ''}expected ${expected}, got ${actual}`);
    }
}

// 1. Pure CarouselModel tests
{
    const model = new CarouselModel({pageCount: 3, initialPage: 0, loop: true});
    assertEqual(model.currentPage, 0);
    assertEqual(model.pageCount, 3);

    // Forward navigation
    assert(model.nextPage(), 'nextPage should advance');
    assertEqual(model.currentPage, 1);
    assert(model.nextPage(), 'nextPage should advance to 2');
    assertEqual(model.currentPage, 2);

    // Loop forward
    assert(model.nextPage(), 'loop back to 0');
    assertEqual(model.currentPage, 0);

    // Backward navigation & loop
    assert(model.prevPage(), 'loop back to 2');
    assertEqual(model.currentPage, 2);
    assert(model.prevPage(), 'back to 1');
    assertEqual(model.currentPage, 1);

    // Direct page setting & bounds
    assert(model.setPage(0), 'setPage(0) returns true');
    assertEqual(model.currentPage, 0);
    assert(!model.setPage(0), 'redundant setPage returns false');

    model.setPage(999);
    assertEqual(model.currentPage, 2, 'clamps to upper bound');
    model.setPage(-5);
    assertEqual(model.currentPage, 0, 'clamps to lower bound');

    // Scroll mapping
    assert(model.handleScroll('DOWN'));
    assertEqual(model.currentPage, 1);
    assert(model.handleScroll('RIGHT'));
    assertEqual(model.currentPage, 2);
    assert(model.handleScroll('UP'));
    assertEqual(model.currentPage, 1);
    assert(model.handleScroll('LEFT'));
    assertEqual(model.currentPage, 0);
}

// 2. Presentation test of FeatureCarousel
{
    let switchedPage = null;
    const carousel = new FeatureCarousel({
        pages: [
            { id: 'metrics', actor: null, label: 'System Metrics' },
            { id: 'settings', actor: null, label: 'Quick Settings' },
        ],
        onPageChanged: (idx) => { switchedPage = idx; },
    });

    assert(carousel);
    assertEqual(carousel.currentPage, 0);
    assertEqual(carousel.pageCount, 2);

    carousel.nextPage();
    assertEqual(carousel.currentPage, 1);
    assertEqual(switchedPage, 1);

    carousel.setPage(0);
    assertEqual(carousel.currentPage, 0);
    assertEqual(switchedPage, 0);

    carousel.destroy();
    assert(carousel._destroyed);
}

console.log('PASS: CarouselModel and FeatureCarousel presentation tests');
