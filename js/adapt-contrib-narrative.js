define(function(require) {

    var ComponentView = require('coreViews/componentView');
    var Adapt = require('coreJS/adapt');

    var Narrative = ComponentView.extend({
        forcedAudio: false,

        events: {
            'click .narrative-strapline-title': 'openPopup',
            'click .narrative-controls': 'onNavigationClicked',
            'click .narrative-indicators .narrative-progress': 'onProgressClicked'
        },

        preRender: function() {
            this.listenTo(Adapt, 'device:changed', this.reRender, this);
            this.listenTo(Adapt, 'device:resize', this.resizeControl, this);
            this.listenTo(Adapt, 'notify:closed', this.closeNotify, this);
            this.listenTo(Adapt, `componentAutoPlay::${this.model.get('_id')}:ended`, this.evaluateCompletion, this);
            this.setDeviceSize();
            // Checks to see if the narrative should be reset on revisit
            this.checkIfResetOnRevisit();
            this.checkForcedAudio();
            this.model.set({
                'AdobeEdges': [],
                'edgeCompositionIds': [],
                'edgeCompositionStages': []
            });

            if(this.model.get('_isPartOfVerticalBlockSlider')) {
                 this.model.set('_didYouKnow')._isEnabled=false;
            }
        },

        setDeviceSize: function() {
            if (Adapt.device.screenSize === 'large') {
                this.$el.addClass('desktop').removeClass('mobile');
                this.model.set('_isDesktop', true);
            } else {
                this.$el.addClass('mobile').removeClass('desktop');
                this.model.set('_isDesktop', false)
            }
        },

        postRender: function() {
            this.renderState();
            this.$('.narrative-slider').imageready(_.bind(function() {
                this.setReadyStatus();
            }, this));
            this.setupNarrative();

            var that = this;
            var AdobeEdges = this.model.get('AdobeEdges');
            var $narrativeSliderGraphic = this.$('.narrative-slider-graphic');
            _.each(this.model.get('_items'), function(item, index) {
                if (item._iframe && item._iframe.src) {
                    var $iframe = $narrativeSliderGraphic.eq(index).find('iframe');
                    $iframe.load(function() {
                        AdobeEdges[index] = $iframe.get(0).contentWindow.AdobeEdge;

                        if (AdobeEdges.length > 0) {
                            window.AdobeEdge = AdobeEdges[index];
                            AdobeEdges[index].bootstrapCallback(function(compId) {
                                if (compId && compId.length > 0) {
                                    that.onEdgeAnimationLoaded(index, compId);
                                }
                            });
                        }
                    });
                }
            });
        },

        // Used to check if the narrative should reset on revisit
        checkIfResetOnRevisit: function() {
            var isResetOnRevisit = this.model.get('_isResetOnRevisit');

            // If reset is enabled set defaults
            if (isResetOnRevisit) {
                this.model.reset(isResetOnRevisit);
                this.model.set({ _stage: 0 });

                _.each(this.model.get('_items'), function(item) {
                    item.visited = false;
                });
            }
        },

        setupNarrative: function() {
            this.setDeviceSize();
            this.model.set('_marginDir', 'left');
            if (Adapt.config.get('_defaultDirection') == 'rtl') {
                this.model.set('_marginDir', 'right');
            }

            this.model.set('_itemCount', this.model.get('_items').length);
            //_sourcedItems used for storing all the iframe source in an array
            var items = this.model.get('_items');

            this.model.set('_active', true);

            if (this.model.get('_stage')) {
                this.setStage(this.model.get('_stage'), true);
            } else {
                this.setStage(0, true);
            }
            this.calculateWidths();

            this.replaceInstructions();
            this.setupEventListeners();

            // if hasNavigationInTextArea set margin left
            var hasNavigationInTextArea = this.model.get('_hasNavigationInTextArea');
            if (hasNavigationInTextArea == true) {
                var indicatorWidth = this.$('.narrative-indicators').width();
                var marginLeft = indicatorWidth / 2;

                this.$('.narrative-indicators').css({
                    marginLeft: '-' + marginLeft + 'px'
                });
            }
        },

        injectEdgeObject: function(index) {
            var AdobeEdges = this.model.get("AdobeEdges");
            if (AdobeEdges[index] && (!AdobeEdges[index].compositions[this.model.get("edgeCompositionIds")[index]])) {
                window.AdobeEdge = AdobeEdges[index];
            }
        },

        onEdgeAnimationLoaded: function(index, compId) {
            this.setReadyStatus();
            this.model.get("edgeCompositionIds")[index] = compId;
            var AdobeEdges = this.model.get("AdobeEdges");
            var compositionStage = AdobeEdges[index].getComposition(compId).getStage();
            this.model.get('edgeCompositionStages')[index] = compositionStage;
        },

        playEdgeAnimation: function(index) {
            var composition = this.model.get('edgeCompositionStages')[index];
            if (composition) {
                this.injectEdgeObject(index);
                composition.stop(0);
                composition.play();
            }
        },

        stopEdgeAnimation: function(index) {
            var composition = this.model.get('edgeCompositionStages')[index];
            if (composition) {
                this.injectEdgeObject(index);
                composition.stop(0);
            }
        },

        calculateWidths: function() {
            var slideWidth = this.$('.narrative-slide-container').width();
            var slideCount = this.model.get('_itemCount');
            var marginRight = this.$('.narrative-slider-graphic').css('margin-right');
            var extraMargin = marginRight === '' ? 0 : parseInt(marginRight);
            var fullSlideWidth = (slideWidth + extraMargin) * slideCount;
            var iconWidth = this.$('.narrative-popup-open').outerWidth();

            this.$('.narrative-slider-graphic').width(slideWidth);
            this.$('.narrative-strapline-header').width(slideWidth);
            this.$('.narrative-strapline-title').width(slideWidth);

            this.$('.narrative-slider').width(fullSlideWidth);
            this.$('.narrative-strapline-header-inner').width(fullSlideWidth);

            var stage = this.model.get('_stage');
            var margin = -(stage * slideWidth);

            this.$('.narrative-slider').css(('margin-' + this.model.get('_marginDir')), margin);
            this.$('.narrative-strapline-header-inner').css(('margin-' + this.model.get('_marginDir')), margin);
            this.model.set('_finalItemLeft', fullSlideWidth - slideWidth);

            if (this.model.get("_shouldScale")) {

                _.each(this.model.get('_items'), function(item, index) {

                    if (item._iframe && item._iframe.src) {
                        var scale = slideWidth / item._iframe._width;
                        this.$('.narrative-frame').css({
                            '-ms-transform': 'scale(' + scale + ')',
                            '-moz-transform': 'scale(' + scale + ')',
                            '-webkit-transform': 'scale(' + scale + ')',
                            '-webkit-transform-style': 'preserve-3d',
                            '-webkit-transform': 'scale3d(' + scale + ',' + scale + ',' + scale + ')',
                            'transform': 'scale(' + scale + ')'
                        });

                        _.defer(_.bind(function() {
                            this.$('.narrative-slider-graphic').eq(index).height(item._iframe._height * scale);
                        }, this));
                    }
                });
            }
        },

        resizeControl: function() {
            this.setDeviceSize();
            this.replaceInstructions();
            this.calculateWidths();
            this.evaluateNavigation();
        },

        reRender: function() {
            if (this.model.get('_wasHotgraphic') && Adapt.device.screenSize == 'large') {
                this.replaceWithHotgraphic();
            } else {
                this.resizeControl();
            }
        },

        closeNotify: function() {
            this.evaluateCompletion();
        },

        replaceInstructions: function() {
            if (Adapt.course.get('_globals').preview_type !== 'ilt') {
                if (Adapt.device.screenSize === 'large') {
                    this.$('.narrative-instruction-inner').html(this.model.get('instruction')).a11y_text();
                } else if (this.model.get('mobileInstruction') && !this.model.get('_wasHotgraphic')) {
                    this.$('.narrative-instruction-inner').html(this.model.get('mobileInstruction')).a11y_text();
                }
            } else {
                this.$('.narrative-instruction-inner').html('');
            }
        },

        replaceWithHotgraphic: function() {
            if (!Adapt.componentStore.hotgraphic) throw "Hotgraphic not included in build";
            var Hotgraphic = Adapt.componentStore.hotgraphic;
            var model = this.prepareHotgraphicModel();
            var newHotgraphic = new Hotgraphic({ model: model });
            var $container = $(".component-container", $("." + this.model.get("_parentId")));

            $container.append(newHotgraphic.$el);
            this.remove();
            _.defer(function() {
                Adapt.trigger('device:resize');
            });
        },

        prepareHotgraphicModel: function() {
            var model = this.model;
            model.set('_component', 'hotgraphic');
            model.set('body', model.get('originalBody'));
            if (Adapt.course.get('_globals').preview_type !== 'ilt'){
                model.set('instruction', model.get('originalInstruction'));
            }
            return model;
        },

        moveSliderToIndex: function(itemIndex, animate, callback) {
            var extraMargin = parseInt(this.$('.narrative-slider-graphic').css('margin-right'));
            var movementSize = this.$('.narrative-slide-container').width() + extraMargin;
            var marginDir = {};
            if (animate && !Adapt.config.get('_disableAnimation')) {
                marginDir['margin-' + this.model.get('_marginDir')] = -(movementSize * itemIndex);
                this.$('.narrative-slider').velocity("stop", true).velocity(marginDir);
                this.$('.narrative-strapline-header-inner').velocity("stop", true).velocity(marginDir, { complete: callback });
            } else {
                marginDir['margin-' + this.model.get('_marginDir')] = -(movementSize * itemIndex);
                this.$('.narrative-slider').css(marginDir);
                this.$('.narrative-strapline-header-inner').css(marginDir);
                callback();
            }
        },

        setStage: function(stage, initial) {
            this.model.set('_stage', stage);
            if (this.model.get('_isDesktop')) {
                // Set the visited attribute for large screen devices
                var currentItem = this.getCurrentItem(stage);
                currentItem.visited = true;
            }

            if (this.$('.narrative-slide-container .narrative-progress').eq(stage).hasClass('visited')) {
                this.$('.narrative-slide-container .narrative-progress').eq(stage).addClass('already-visited');
            } else {
                this.$('.narrative-slide-container .narrative-progress').eq(stage).addClass('visited');
            }

            this.$('.narrative-progress:visible').removeClass('selected').eq(stage).addClass('selected');
            this.$('.narrative-slider-graphic').children('.controls').a11y_cntrl_enabled(false);
            this.$('.narrative-slider-graphic').eq(stage).children('.controls').a11y_cntrl_enabled(true);
            this.$('.narrative-content-item').addClass('narrative-hidden').a11y_on(false).eq(stage).removeClass('narrative-hidden').a11y_on(true);
            this.$('.narrative-strapline-title').a11y_cntrl_enabled(false).eq(stage).a11y_cntrl_enabled(true);

            this.evaluateNavigation();
            this.evaluateCompletion();

            this.moveSliderToIndex(stage, !initial, _.bind(function() {
                if (this.model.get('_isDesktop')) {
                    if (!initial) this.$('.narrative-content-item').eq(stage).a11y_focus();
                } else {
                    if (!initial) this.$('.narrative-popup-open').a11y_focus();
                }
            }, this));
        },

        constrainStage: function(stage) {
            if (stage > this.model.get('_items').length - 1) {
                stage = this.model.get('_items').length - 1;
            } else if (stage < 0) {
                stage = 0;
            }
            return stage;
        },

        constrainXPosition: function(previousLeft, newLeft, deltaX) {
            if (newLeft > 0 && deltaX > 0) {
                newLeft = previousLeft + (deltaX / (newLeft * 0.1));
            }
            var finalItemLeft = this.model.get('_finalItemLeft');
            if (newLeft < -finalItemLeft && deltaX < 0) {
                var distance = Math.abs(newLeft + finalItemLeft);
                newLeft = previousLeft + (deltaX / (distance * 0.1));
            }
            return newLeft;
        },

        evaluateNavigation: function() {
            var currentStage = this.model.get('_stage');
            var itemCount = this.model.get('_itemCount');
            if (currentStage == 0) {
                this.$('.narrative-control-left').addClass('narrative-hidden');

                if (itemCount > 1) {
                    this.$('.narrative-control-right').removeClass('narrative-hidden');
                }
            } else {
                this.$('.narrative-control-left').removeClass('narrative-hidden');

                if (currentStage == itemCount - 1) {
                    this.$('.narrative-control-right').addClass('narrative-hidden');
                } else {
                    this.$('.narrative-control-right').removeClass('narrative-hidden');
                }
            }

        },

        getNearestItemIndex: function() {
            var currentPosition = parseInt(this.$('.narrative-slider').css('margin-left'));
            var graphicWidth = this.$('.narrative-slider-graphic').width();
            var absolutePosition = currentPosition / graphicWidth;
            var stage = this.model.get('_stage');
            var relativePosition = stage - Math.abs(absolutePosition);

            if (relativePosition < -0.3) {
                stage++;
            } else if (relativePosition > 0.3) {
                stage--;
            }

            return this.constrainStage(stage);
        },

        getCurrentItem: function(index) {
            return this.model.get('_items')[index];
        },

        getCompletedItems: function() {
            return _.filter(this.model.get('_items'), function(item) {
                if (this.forcedAudio) {
                    return item.visited && item.audioCompleted;
                } else {
                    return item.visited;
                }
            });
        },

        itemsAreCompleted: function() {
            return this.getCompletedItems().length === this.model.get('_items').length
        },

        evaluateCompletion: function() {
            if (this.itemsAreCompleted()) {
                this.trigger('allItems');
            }
        },

        moveElement: function($element, deltaX) {
            var previousLeft = parseInt($element.css('margin-left'));
            var newLeft = previousLeft + deltaX;

            newLeft = this.constrainXPosition(previousLeft, newLeft, deltaX);
            $element.css(('margin-' + this.model.get('_marginDir')), newLeft + 'px');
        },

        openPopup: function(event) {
            event.preventDefault();
            var currentItem = this.getCurrentItem(this.model.get('_stage'));
            var popupObject = {
                title: currentItem.title,
                body: currentItem.body
            };
            // Set the visited attribute for small and medium screen devices
            currentItem.visited = true;

            Adapt.trigger('notify:popup', popupObject);
        },

        onNavigationClicked: function(event) {
            if (event && event.preventDefault) event.preventDefault();
            if (!this.model.get('_active')) return;

            var stage = this.model.get('_stage');
            var numberOfItems = this.model.get('_itemCount');

            if ($(event.currentTarget).hasClass('narrative-control-right')) {
                if (this.model.get('_items')[stage]._iframe) {
                    this.stopEdgeAnimation(stage);
                }
                stage++;
                if (this.model.get('_items')[stage]._iframe) {
                    this.playEdgeAnimation(stage);
                }
            } else if ($(event.currentTarget).hasClass('narrative-control-left')) {
                if (this.model.get('_items')[stage]._iframe) {
                    this.stopEdgeAnimation(stage);
                }
                stage--;
                if (this.model.get('_items')[stage]._iframe) {
                    this.playEdgeAnimation(stage);
                }
            }
            stage = (stage + numberOfItems) % numberOfItems;
            this.setStage(stage);
        },

        onProgressClicked: function(event) {
            event.preventDefault();
            var clickedIndex = $(event.target).index();
            this.setStage(clickedIndex);
        },

        onInview: function(event, visible, visiblePartX, visiblePartY) {
            if (visible) {
                if (visiblePartY === 'top') {
                    this._isVisibleTop = true;
                } else if (visiblePartY === 'bottom') {
                    this._isVisibleBottom = true;
                } else {
                    this._isVisibleTop = true;
                    this._isVisibleBottom = true;
                }
                if (this._isVisibleTop && this._isVisibleBottom) {
                    //this.$('.component-inner').off('inview');
                    if(this.completionEvent === 'inview') {
                        this.setCompletionStatus();
                    }
                    this.playEdgeAnimation(this.model.get('_stage'));
                }
            } else {
                this.stopEdgeAnimation(this.model.get('_stage'));
            }
        },

        onCompletion: function() {
            this.setCompletionStatus();
            if (this.completionEvent && this.completionEvent != 'inview') {
                this.off(this.completionEvent, this);
            }
        },

        setupEventListeners: function() {
            this.completionEvent = (!this.model.get('_setCompletionOn')) ? 'allItems' : this.model.get('_setCompletionOn');
            if (this.completionEvent !== 'inview') {
                this.on(this.completionEvent, _.bind(this.onCompletion, this));
            }
            this.$('.component-widget').on('inview', _.bind(this.onInview, this));
        },

        checkForcedAudio: function () {
            var _forceAudioConfig = Adapt.articles.models[0].get('_forceAudio');

            this.forcedAudio = _forceAudioConfig &&
                _forceAudioConfig.hasOwnProperty('_isEnabled') &&
                _forceAudioConfig._isEnabled;
        }

    });

    Adapt.register('narrative', Narrative);

    return Narrative;

});
