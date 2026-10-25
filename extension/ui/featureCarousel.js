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
        // Handle numeric Clutter directions or string directions
        // Clutter.ScrollDirection: UP=0, DOWN=1, LEFT=2, RIGHT=3
        if (direction === 1 || direction === 3 || direction === 'DOWN' || direction === 'RIGHT') {
            return this.nextPage();
        } else if (direction === 0 || direction === 2 || direction === 'UP' || direction === 'LEFT') {
            return this.prevPage();
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

        // Page container
        this._container = new St.BoxLayout({
            vertical: true,
            x_expand: true,
        });

        for (let i = 0; i < this._pages.length; ++i) {
            const page = this._pages[i];
            if (page.actor) {
                page.actor.visible = (i === this._model.currentPage);
                this._container.add_child(page.actor);
            }
        }
        this.actor.add_child(this._container);

        // Dot indicators
        if (this._pages.length > 1) {
            this._dotsBox = new St.BoxLayout({
                style: 'spacing: 4px; padding-top: 2px;',
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

        // Scroll wheel event for sliding left/right
        this.actor.connect('scroll-event', (_actor, event) => {
            const now = GLib ? GLib.get_monotonic_time() : Date.now() * 1000;
            // Debounce 250ms
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
        if (this._model.setPage(index)) {
            this._syncView();
            this._onPageChanged(this._model.currentPage);
        }
    }

    nextPage() {
        if (this._model.nextPage()) {
            this._syncView();
            this._onPageChanged(this._model.currentPage);
        }
    }

    prevPage() {
        if (this._model.prevPage()) {
            this._syncView();
            this._onPageChanged(this._model.currentPage);
        }
    }

    _syncView() {
        if (this._destroyed) return;
        const current = this._model.currentPage;

        for (let i = 0; i < this._pages.length; ++i) {
            const page = this._pages[i];
            if (page.actor) {
                page.actor.visible = (i === current);
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
        if (this.actor) {
            this.actor.destroy();
            this.actor = null;
        }
    }
}
