import {CarouselModel, FeatureCarousel, getPageIcon} from '../../extension/ui/featureCarousel.js';

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

    // Drag / swipe mapping
    assert(!model.handleDrag(-10, 0, 35), 'drag under threshold ignored');
    assertEqual(model.currentPage, 0);
    assert(model.handleDrag(-50, 5, 35), 'swipe left advances page');
    assertEqual(model.currentPage, 1);
    assert(model.handleDrag(50, 5, 35), 'swipe right goes back');
    assertEqual(model.currentPage, 0);
    assert(!model.handleDrag(50, 80, 35), 'vertical gesture ignored');
    assertEqual(model.currentPage, 0);
}
// 2. Section icon helper tests
{
    assertEqual(getPageIcon({iconName: 'custom-symbolic'}), 'custom-symbolic');
    assertEqual(getPageIcon({id: 'media'}), 'audio-x-generic-symbolic');
    assertEqual(getPageIcon({id: 'music'}), 'audio-x-generic-symbolic');
    assertEqual(getPageIcon({id: 'system'}), 'preferences-system-symbolic');
    assertEqual(getPageIcon({id: 'controls'}), 'preferences-system-symbolic');
    assertEqual(getPageIcon({id: 'metrics'}), 'preferences-system-symbolic');
    assertEqual(getPageIcon({id: 'settings'}), 'view-more-symbolic');
    assertEqual(getPageIcon({id: 'ai'}), 'applications-science-symbolic');
    assertEqual(getPageIcon({id: 'quota'}), 'applications-science-symbolic');
    assertEqual(getPageIcon({id: 'ai-quota'}), 'applications-science-symbolic');
    assertEqual(getPageIcon({id: 'search'}), 'system-search-symbolic');
    assertEqual(getPageIcon(null), 'view-more-symbolic');
}


// 3. Presentation test of FeatureCarousel
{
    let switchedPage = null;
    const carousel = new FeatureCarousel({
        pages: [
            { id: 'media', actor: null, label: 'Music', iconName: 'audio-x-generic-symbolic' },
            { id: 'system', actor: null, label: 'System & Controls', iconName: 'preferences-system-symbolic' },
        ],
        onPageChanged: (idx) => { switchedPage = idx; },
    });
    assert(carousel);
    assertEqual(carousel.currentPage, 0);
    assertEqual(carousel.pageCount, 2);
    assertEqual(carousel._showTopNav, true);
    assertEqual(carousel._showDots, false);
    carousel.nextPage();
    assertEqual(carousel.currentPage, 1);
    assertEqual(switchedPage, 1);

    carousel.setPage(0);
    assertEqual(carousel.currentPage, 0);
    assertEqual(switchedPage, 0);

    carousel.setPage(1);
    assertEqual(carousel.currentPage, 1);
    assertEqual(switchedPage, 1);
    carousel.destroy();
    assert(carousel._destroyed);
}

// 4. Interactive control detection tests
{
    const carousel = new FeatureCarousel();
    assertEqual(carousel._isInteractiveControl(null), false);
    assertEqual(carousel._isInteractiveControl({classes: new Set(['linux-island__section-btn'])}), true);
    assertEqual(carousel._isInteractiveControl({classes: new Set(['linux-island__media-button'])}), true);
    assertEqual(carousel._isInteractiveControl({classes: new Set(['linux-island__progress-track'])}), true);
    assertEqual(carousel._isInteractiveControl({classes: new Set(['linux-island__progress-fill'])}), true);
    assertEqual(carousel._isInteractiveControl({classes: new Set(['linux-island__quota-action'])}), true);
    assertEqual(carousel._isInteractiveControl({classes: new Set(['linux-island__quota-row'])}), true);
    assertEqual(carousel._isInteractiveControl({classes: new Set(['linux-island__search-entry'])}), true);
    assertEqual(carousel._isInteractiveControl({classes: new Set(['linux-island__search-action'])}), true);
    assertEqual(carousel._isInteractiveControl({classes: new Set(['linux-island__search-engine-btn'])}), true);
    assertEqual(carousel._isInteractiveControl({classes: new Set(['linux-island__search-engine-btn--active'])}), true);
    assertEqual(carousel._isInteractiveControl({classes: new Set(['other-class'])}), false);
    // Real GJS St.Widget actors have no `.classes` Set; they expose
    // has_style_class_name(). This is the runtime shape that must be detected.
    const gjsLikeActor = {
        has_style_class_name: name => name === 'linux-island__search-entry',
        get_parent: () => null,
    };
    assertEqual(carousel._isInteractiveControl(gjsLikeActor), true);
    const gjsLikePlain = {
        has_style_class_name: () => false,
        get_parent: () => null,
    };
    assertEqual(carousel._isInteractiveControl(gjsLikePlain), false);
    carousel.destroy();
}

console.log('PASS: CarouselModel and FeatureCarousel presentation tests');
