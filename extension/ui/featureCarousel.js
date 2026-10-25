// Horizontal carousel and slideable feature pages for Linux Island (v0.2).
// Provides paginated horizontal switching with smooth transitions and dot indicators.

let St = null;
let Clutter = null;
let GLib = null;
if (typeof process === 'undefined') {
    try {
        St = (await import('gi://St')).default;
        Clutter = (await import('gi://Clutter')).default;
        GLib = (await import('gi://GLib')).default;
    } catch (_) {}
}

export class CarouselModel {
    constructor({pageCount = 1, initialPage = 0, loop = true} = {}) {
        this.pageCount = Math.max(1, pageCount);
        this.currentPage = Math.max(0, Math.min(this.pageCount - 1, initialPage));
        this.loop = loop;
    }

    setPage(index) {
        const clamped = Math.max(0, Math.min(this.pageCount - 1, index));
        if (clamped !== this.currentPage) {
            this.currentPage = clamped;
            return true;
        }
        return false;
    }

    nextPage() {
        if (this.currentPage < this.pageCount - 1) {
            this.currentPage++;
            return true;
        } else if (this.loop && this.pageCount > 1) {
            this.currentPage = 0;
            return true;
        }
        return false;
    }

    prevPage() {
        if (this.currentPage > 0) {
            this.currentPage--;
            return true;
        } else if (this.loop && this.pageCount > 1) {
            this.currentPage = this.pageCount - 1;
            return true;
        }
        return false;
    }

    handleScroll(direction) {
        if (direction === 1 || direction === 3 || direction === 'DOWN' || direction === 'RIGHT') {
            return this.nextPage();
        } else if (direction === 0 || direction === 2 || direction === 'UP' || direction === 'LEFT') {
            return this.prevPage();
        }
        return false;
    }

    handleDrag(dx, dy, threshold = 25) {
        if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0) {
                return this.nextPage();
            } else {
                return this.prevPage();
            }
        }
        return false;
    }
}

export class FeatureCarousel {
    constructor({pages = [], onPageChanged} = {}) {
        this._pages = pages.filter(p => Boolean(p));
        this._onPageChanged = onPageChanged ?? (() => {});
        this._model = new CarouselModel({pageCount: Math.max(1, this._pages.length), loop: true});
        this._lastScrollTime = 0;
        this._destroyed = false;
        this.actor = null;
        this._dotsBox = null;
        this._dots = [];
        this._container = null;

        if (St && Clutter) {
            this._build();
        }
    }

    get currentPage() {
        return this._model.currentPage;
    }

    get pageCount() {
        return this._model.pageCount;
    }

    _build() {
        this.actor = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 4px;',
            x_expand: true,
            reactive: true,
        });

        // St.Bin gives full, proper allocation to the active page
        this._container = new St.Bin({
            x_expand: true,
            y_expand: true,
        });
        this.actor.add_child(this._container);

        const initial = this._pages[this._model.currentPage];
        if (initial?.actor) {
            this._container.set_child(initial.actor);
        }

        // Dot indicators
        if (this._pages.length > 1) {
            this._dotsBox = new St.BoxLayout({
                style: 'spacing: 6px; padding-top: 2px;',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });

            this._dots = [];
            for (let i = 0; i < this._pages.length; ++i) {
                const dot = new St.Button({
                    style_class: (i === this._model.currentPage)
                        ? 'linux-island__carousel-dot linux-island__carousel-dot--active'
                        : 'linux-island__carousel-dot',
                    reactive: true,
                    can_focus: true,
                    accessible_name: this._pages[i].label || `Page ${i + 1}`,
                });
                dot.connect('clicked', () => this.setPage(i));
                this._dots.push(dot);
                this._dotsBox.add_child(dot);
            }
            this.actor.add_child(this._dotsBox);
        }

        // Mouse drag gesture to slide horizontally
        let startX = 0;
        let startY = 0;
        let isPressed = false;
        let hasSwiped = false;

        this.actor.connect('button-press-event', (_actor, event) => {
            if (typeof event.get_button === 'function' && event.get_button() === 1) {
                isPressed = true;
                hasSwiped = false;
                const coords = typeof event.get_coords === 'function' ? event.get_coords() : [0, 0];
                startX = coords[0];
                startY = coords[1];
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this.actor.connect('motion-event', (_actor, event) => {
            if (!isPressed || hasSwiped) return Clutter.EVENT_PROPAGATE;
            const coords = typeof event.get_coords === 'function' ? event.get_coords() : [0, 0];
            const dx = coords[0] - startX;
            const dy = coords[1] - startY;
            if (this._model.handleDrag(dx, dy, 25)) {
                hasSwiped = true;
                this._syncView(dx < 0 ? 1 : -1);
                this._onPageChanged(this._model.currentPage);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this.actor.connect('button-release-event', () => {
            const consumed = hasSwiped;
            isPressed = false;
            hasSwiped = false;
            return consumed ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
        });

        // Scroll wheel event for sliding left/right
        this.actor.connect('scroll-event', (_actor, event) => {
            const now = GLib ? GLib.get_monotonic_time() : Date.now() * 1000;
            if (now - this._lastScrollTime < 250000) {
                return Clutter.EVENT_STOP;
            }
            this._lastScrollTime = now;

            const dir = event.get_scroll_direction();
            if (dir === Clutter.ScrollDirection.DOWN || dir === Clutter.ScrollDirection.RIGHT) {
                this.nextPage();
            } else if (dir === Clutter.ScrollDirection.UP || dir === Clutter.ScrollDirection.LEFT) {
                this.prevPage();
            }
            return Clutter.EVENT_STOP;
        });
    }

    setPage(index) {
        const prev = this._model.currentPage;
        if (this._model.setPage(index)) {
            const direction = index >= prev ? 1 : -1;
            this._syncView(direction);
            this._onPageChanged(this._model.currentPage);
        }
    }

    nextPage() {
        if (this._model.nextPage()) {
            this._syncView(1);
            this._onPageChanged(this._model.currentPage);
        }
    }

    prevPage() {
        if (this._model.prevPage()) {
            this._syncView(-1);
            this._onPageChanged(this._model.currentPage);
        }
    }

    _syncView(direction = 1) {
        if (this._destroyed || !this._container) return;
        const current = this._model.currentPage;
        const page = this._pages[current];

        if (page?.actor) {
            const actor = page.actor;
            const enableAnim = St?.Settings?.get()?.enable_animations !== false;

            if (enableAnim && typeof actor.ease === 'function') {
                actor.remove_all_transitions();
                actor.translation_x = direction * 35;
                actor.opacity = 60;
                this._container.set_child(actor);
                actor.ease({
                    translation_x: 0,
                    opacity: 255,
                    duration: 200,
                    mode: Clutter?.AnimationMode?.EASE_OUT_CUBIC ?? 1,
                });
            } else {
                actor.translation_x = 0;
                actor.opacity = 255;
                this._container.set_child(actor);
            }

            if (typeof page.onActivate === 'function') {
                page.onActivate();
            }
        }

        for (let i = 0; i < this._dots.length; ++i) {
            const dot = this._dots[i];
            if (i === current) {
                dot.add_style_class_name('linux-island__carousel-dot--active');
            } else {
                dot.remove_style_class_name('linux-island__carousel-dot--active');
            }
        }
    }

    destroy() {
        this._destroyed = true;
        this._dots = [];
        if (this._container) {
            this._container.set_child(null);
            this._container = null;
        }
        if (this.actor) {
            this.actor.destroy();
            this.actor = null;
        }
    }
}
