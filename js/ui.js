/**
 * INTERFACE DO USUÁRIO - PROMOCITY
 * Renderização dinâmica e manipulação de DOM
 * VERSÃO FINAL - Com botões de upgrade/downgrade e suporte a latitude/longitude
 * CORREÇÃO: Botão WhatsApp nos stories normalizado (espaços removidos dos URLs)
 */

const ui = {
    // Elementos cacheados
    elements: {},

    /**
     * Formata o endereço de RETIRADA (comerciante) com link do Google Maps usando lat/lng.
     */
    formatPickupAddress(address, lat, lng) {
        const label = address || 'Ver localização';
        if (lat && lng) {
            const url = `https://maps.google.com/?q=${lat},${lng}`;
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="maps-link-btn maps-pickup-btn"><i class="fas fa-store"></i> ${label}</a>`;
        }
        return label;
    },

    /**
     * Formata o endereço de entrega: se for GPS (contém link do Maps), retorna HTML com botão clicável.
     */
    formatDeliveryAddress(rawAddress) {
        if (!rawAddress) return '-';
        const mapsMatch = rawAddress.match(/(https:\/\/maps\.google\.com\/\?q=[^\s]+)/);
        if (mapsMatch) {
            const url = mapsMatch[1];
            let label = rawAddress.replace(/ — https:\/\/maps\.google\.com\/\?q=[^\s]+/, '').replace('📍 ', '').trim();
            // Se o label parecer coordenadas (só números, vírgula, ponto, sinal) exibe texto amigável
            if (!label || /^[-\d.,\s]+$/.test(label)) label = 'Ver localização no mapa';
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="maps-link-btn"><i class="fas fa-map-marker-alt"></i> ${label}</a>`;
        }
        return utils.sanitizeInput ? utils.sanitizeInput(rawAddress) : rawAddress;
    },

    /**
     * Inicializa referências de elementos DOM
     */
    init() {
        // Telas
        this.elements.screens = {
            login: document.getElementById('login-screen'),
            register: document.getElementById('register-screen'),
            main: document.getElementById('main-screen'),
            profile: document.getElementById('profile-screen'),
            favorites: document.getElementById('favorites-screen'),
            publish: document.getElementById('publish-screen'),
            search: document.getElementById('search-screen'),
            story: document.getElementById('story-viewer'),
            editProfile: document.getElementById('edit-profile-screen'),
            'story-publish': document.getElementById('story-publish-screen'),
            map: document.getElementById('map-screen'),
            'delivery-request': document.getElementById('delivery-request-screen'),
            'motoboy-dashboard': document.getElementById('motoboy-dashboard-screen'),
            'merchant-orders': document.getElementById('merchant-orders-screen'),
            'delivery-tracking': document.getElementById('delivery-tracking-screen'),
            'delivery-detail': document.getElementById('delivery-detail-screen'),
            'my-deliveries': document.getElementById('my-deliveries-screen'),
            highlightEdit: document.getElementById('highlight-edit-screen')
        };

        // Containers
        this.elements.feed = document.getElementById('feed-list');
        this.elements.stories = document.getElementById('stories-list');
        this.elements.favorites = document.getElementById('favorites-list');
        this.elements.profile = document.getElementById('profile-content');
        this.elements.searchResults = document.getElementById('search-results');
        this.elements.toastContainer = document.getElementById('toast-container');
        this.elements.loading = document.getElementById('loading-overlay');
        this.elements.bottomNav = document.getElementById('bottom-nav');
        this.elements.mapList = document.getElementById('map-promo-list');
        this.elements.notificationsBadge = document.getElementById('notifications-badge');
        this.elements.floatingMapBtn = document.getElementById('floating-map-btn');
        this.elements.commentsModal = document.getElementById('comments-modal');
        this.elements.commentsList = document.getElementById('comments-list');
        this.elements.commentInput = document.getElementById('comment-input');
        this.elements.commentSubmit = document.getElementById('comment-submit');
        this._bindPromoCardOwnerMenus();
    },

    /**
     * Menu ⋮ (editar/excluir) nos cards de promoção do autor — apenas UI (abrir/fechar/fora).
     */
    _bindPromoCardOwnerMenus() {
        if (this._promoOwnerMenuBound) return;
        this._promoOwnerMenuBound = true;
        document.addEventListener('click', (e) => {
            const item = e.target.closest('.promo-card-menu-item');
            if (item) {
                const host = item.closest('.promo-card-owner-menu-host');
                if (host) {
                    host.classList.remove('is-open');
                    host.querySelector('.promo-card-menu-trigger')?.setAttribute('aria-expanded', 'false');
                }
                return;
            }
            const trigger = e.target.closest('.promo-card-menu-trigger');
            if (trigger) {
                e.stopPropagation();
                const host = trigger.closest('.promo-card-owner-menu-host');
                if (!host) return;
                const wasOpen = host.classList.contains('is-open');
                document.querySelectorAll('.promo-card-owner-menu-host.is-open').forEach((h) => {
                    h.classList.remove('is-open');
                    h.querySelector('.promo-card-menu-trigger')?.setAttribute('aria-expanded', 'false');
                });
                if (!wasOpen) {
                    host.classList.add('is-open');
                    trigger.setAttribute('aria-expanded', 'true');
                }
                return;
            }
            document.querySelectorAll('.promo-card-owner-menu-host.is-open').forEach((h) => {
                if (!h.contains(e.target)) {
                    h.classList.remove('is-open');
                    h.querySelector('.promo-card-menu-trigger')?.setAttribute('aria-expanded', 'false');
                }
            });
        });
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            document.querySelectorAll('.promo-card-owner-menu-host.is-open').forEach((h) => {
                h.classList.remove('is-open');
                h.querySelector('.promo-card-menu-trigger')?.setAttribute('aria-expanded', 'false');
            });
        });
    },

    /**
     * Navegação entre telas
     * @param {string} screenName
     * @param {object} [options]
     * @param {'push'|'replace'|'none'} [options.historyMode='push']
     */
    navigateTo(screenName, options) {
        const historyMode = (options && options.historyMode) || 'push';

        Object.values(this.elements.screens).forEach(screen => {
            if (screen) screen.classList.add('hidden');
        });

        const target = this.elements.screens[screenName];
        if (target) {
            target.classList.remove('hidden');
            window.scrollTo(0, 0);
        }

        if (window.app && window.app.state) {
            window.app.state.currentScreen = screenName;
        }

        const stateObj = { screen: screenName };
        const hash = '#' + screenName;
        if (historyMode === 'replace') {
            window.history.replaceState(stateObj, '', hash);
        } else if (historyMode === 'push') {
            if (!window.history.state || window.history.state.screen !== screenName) {
                window.history.pushState(stateObj, '', hash);
            }
        }

        // Mostrar/esconder bottom nav
        if (screenName === 'main' || screenName === 'search' || screenName === 'favorites' || screenName === 'profile' || screenName === 'map') {
            this.elements.bottomNav.classList.remove('hidden');
            this.updateNavActive(screenName);
        } else {
            this.elements.bottomNav.classList.add('hidden');
        }

        // Botão flutuante do mapa: só nas telas de feed/promoções (main, mapa, busca, favoritos)
        const showFloatingMapBtn = ['main', 'map', 'search', 'favorites'].includes(screenName);
        if (this.elements.floatingMapBtn) {
            this.elements.floatingMapBtn.classList.toggle('hidden', !showFloatingMapBtn);
        }
    },

    /**
     * Atualiza item ativo na navegação
     */
    updateNavActive(screenName) {
        const map = {
            'main': 'main-screen',
            'search': 'search-screen',
            'favorites': 'favorites-screen',
            'profile': 'profile-screen',
            'map': 'map-screen'
        };

        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.screen === map[screenName]) {
                item.classList.add('active');
            }
        });
    },

    /**
     * Mostra/esconde loading
     */
    showLoading(show = true) {
        this.elements.loading.classList.toggle('hidden', !show);
    },

    /**
     * Toast notifications
     */
    showToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        const safeIcon = icons[type] || icons.info;
        const safeMessage = utils.escapeHTML ? utils.escapeHTML(message) : utils.sanitizeInput(message);

        toast.innerHTML = `
            <i class="fas fa-${safeIcon}"></i>
            <span class="toast-message">${safeMessage}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

        this.elements.toastContainer.appendChild(toast);

        if (duration > 0) {
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-20px)';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }
    },

    /**
     * Exibe um popup de notificação in-app com título, mensagem e botão de ação opcional.
     * Pode ser chamado manualmente; o badge/lista de notificações atualiza por polling (sem WebSocket).
     */
    showNotificationPopup(notification, duration = 7000) {
        if (!this.elements.toastContainer) return;
        const title = notification.title || 'Nova notificação';
        const message = notification.message || '';
        const actionUrl = notification.action_url || '';
        const actionLabel = notification.action_label || 'Abrir';
        const notifId = notification.id || '';

        const popup = document.createElement('div');
        popup.className = 'notification-popup';

        const actionHtml = actionUrl
            ? `<div class="notification-popup-action">
                <button class="btn btn-primary" id="npopup-action-${notifId}">
                    ${utils.sanitizeInput(actionLabel)}
                </button>
               </div>`
            : '';

        popup.innerHTML = `
            <div class="notification-popup-header">
                <div class="notification-popup-title">
                    <i class="fas fa-bell"></i>
                    ${utils.sanitizeInput(title)}
                </div>
                <button class="notification-popup-close" aria-label="Fechar">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            ${message ? `<div class="notification-popup-message">${utils.sanitizeInput(message)}</div>` : ''}
            ${actionHtml}
        `;

        // Fechar manual
        popup.querySelector('.notification-popup-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this._dismissNotificationPopup(popup);
        });

        // Clique no botão de ação
        if (actionUrl && notifId) {
            const actionBtn = popup.querySelector(`#npopup-action-${notifId}`);
            if (actionBtn) {
                actionBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._dismissNotificationPopup(popup);
                    if (typeof app !== 'undefined') app.openNotificationAction(notifId, actionUrl);
                });
            }
        }

        // Clique no corpo do popup também dispara a ação
        popup.addEventListener('click', () => {
            this._dismissNotificationPopup(popup);
            if (actionUrl && notifId && typeof app !== 'undefined') {
                app.openNotificationAction(notifId, actionUrl);
            }
        });

        this.elements.toastContainer.appendChild(popup);

        if (duration > 0) {
            setTimeout(() => this._dismissNotificationPopup(popup), duration);
        }
    },

    _dismissNotificationPopup(popup) {
        if (!popup || !popup.parentElement) return;
        popup.style.opacity = '0';
        popup.style.transform = 'translateY(-20px)';
        popup.style.transition = 'opacity 0.3s, transform 0.3s';
        setTimeout(() => popup.remove(), 300);
    },

    /**
     * Agrupa stories por autor
     */
    groupStoriesByAuthor(stories) {
        const grouped = {};
        stories.forEach(story => {
            // Ignora stories sem autor (join falhou ou usuário deletado)
            if (!story.author || !story.author.id) return;
            const authorId = story.author.id;
            if (!grouped[authorId]) {
                grouped[authorId] = {
                    author: story.author,
                    stories: []
                };
            }
            grouped[authorId].stories.push(story);
        });
        return Object.values(grouped).map(group => {
            group.stories.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            return group;
        });
    },

    /**
     * Renderiza lista de stories (agrupados por autor)
     */
    renderStories(stories) {
        const esc = utils.escapeHTML || utils.sanitizeInput;
        const safeUrl = (url, fallback = '') => (
            utils.sanitizeUrl ? utils.sanitizeUrl(url, { fallback, allowDataImage: true }) : (url || fallback)
        );
        let html = '';

        // Botão de adicionar apenas para comerciantes logados
        // ID diferente do botão do menu flutuante para evitar conflito de IDs no DOM
        if (auth.isAuthenticated() && auth.isMerchant()) {
            html += `
                <div class="story-item" id="stories-bar-add-btn">
                    <div class="story-avatar story-avatar-add">
                        <i class="fas fa-plus" aria-hidden="true"></i>
                    </div>
                    <span>Adicionar</span>
                </div>
            `;
        }

        if (!stories || stories.length === 0) {
            if (!auth.isAuthenticated()) {
                html += `
                    <div class="story-item">
                        <div class="story-avatar" style="background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-camera" style="color: var(--text-muted); font-size: 2rem;"></i>
                        </div>
                        <span>Sem stories</span>
                    </div>
                `;
            }
            this.elements.stories.innerHTML = html;
            this.attachStoryListeners();
            return;
        }

        const grouped = this.groupStoriesByAuthor(stories);

        grouped.forEach(group => {
            if (!group.stories || group.stories.length === 0) return;

            // groupStoriesByAuthor ordena por created_at DESC → stories[0] é o mais recente.
            // O círculo exibe sempre a imagem do story mais recente.
            const newestStory = group.stories[0];
            const storyImageUrl = safeUrl(newestStory.image_url, '');
            if (!storyImageUrl) return; // Sem imagem → não renderizar círculo

            const storyCount = group.stories.length;
            const avatarClass = storyCount > 1 ? 'story-avatar multiple' : 'story-avatar';
            const safeAuthorName = esc(group.author.business_name || group.author.name || '');
            const safeAuthorId = esc(String(group.author.id ?? ''));
            const storyIdsEncoded = esc(encodeURIComponent(JSON.stringify(group.stories.map(s => String(s.id ?? '')))));

            html += `
                <div class="story-item" data-author-id="${safeAuthorId}" data-story-ids="${storyIdsEncoded}">
                    <div class="${avatarClass} story-preview-circle"
                         style="background-image: url('${storyImageUrl}'); background-size: cover; background-position: center;">
                    </div>
                    <span>${safeAuthorName}</span>
                </div>
            `;
        });

        this.elements.stories.innerHTML = html;

        this.attachStoryListeners();
    },

    /**
     * Anexa listeners aos stories e ao botão de adicionar
     */
    attachStoryListeners() {
        document.querySelectorAll('.story-item[data-author-id]').forEach(item => {
            item.addEventListener('click', (e) => {
                const authorId = item.dataset.authorId;
                let storyIds = [];
                try {
                    storyIds = JSON.parse(decodeURIComponent(item.dataset.storyIds || '%5B%5D'));
                } catch (_) {
                    storyIds = [];
                }
                if (authorId && storyIds.length > 0) {
                    app.viewAuthorStories(authorId, storyIds);
                }
            });
        });

        const addBtn = document.getElementById('stories-bar-add-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                if (!auth.isAuthenticated()) {
                    ui.showToast('Faça login para publicar stories', 'warning');
                    ui.navigateTo('login');
                    return;
                }
                ui.navigateTo('story-publish');
                const expiresInput = document.getElementById('story-expires');
                if (expiresInput) {
                    const now = new Date();
                    now.setHours(now.getHours() + 24);
                    const year = now.getFullYear();
                    const month = String(now.getMonth() + 1).padStart(2, '0');
                    const day = String(now.getDate()).padStart(2, '0');
                    const hours = String(now.getHours()).padStart(2, '0');
                    const minutes = String(now.getMinutes()).padStart(2, '0');
                    expiresInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
                }
            });
        }
    },

    /**
     * Renderiza sequência de stories de um autor
     * VERSÃO CORRIGIDA - Botão WhatsApp com URL sem espaços
     */
    renderStorySequence(stories, onNextGroup = null, onPrevGroup = null) {
        if (!stories || stories.length === 0) return;
        const esc = utils.escapeHTML || utils.sanitizeInput;
        const safeUrl = (url, fallback = '') => (
            utils.sanitizeUrl ? utils.sanitizeUrl(url, { fallback, allowDataImage: true }) : (url || fallback)
        );

        const STORY_DURATION = 5000;
        let currentIndex = 0;
        let isPaused = false;
        let storyTimer = null;
        let remainingTime = STORY_DURATION;
        let storyStartTime = null;

        const viewer = this.elements.screens.story;
        const content = document.getElementById('story-content');
        const progress = document.getElementById('story-progress');
        const closeBtn = document.getElementById('close-story');

        if (closeBtn && closeBtn.parentNode) {
            const newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        }

        // Remove ícone de pausa anterior se existir
        const oldPauseIcon = viewer.querySelector('.story-pause-icon');
        if (oldPauseIcon) oldPauseIcon.remove();

        // Cria ícone de pausa
        const pauseIcon = document.createElement('div');
        pauseIcon.className = 'story-pause-icon hidden';
        pauseIcon.innerHTML = '<i class="fas fa-pause"></i>';
        viewer.appendChild(pauseIcon);

        const closeClean = () => {
            clearTimeout(storyTimer);
            this.closeStoryViewer();
        };

        const advance = () => {
            if (currentIndex < stories.length - 1) {
                currentIndex++;
                startStory(currentIndex);
            } else if (onNextGroup) {
                closeClean();
                onNextGroup();
            } else {
                closeClean();
            }
        };

        const startProgress = (duration) => {
            progress.style.transition = 'none';
            progress.style.width = '0%';
            progress.offsetHeight;
            setTimeout(() => {
                progress.style.transition = `width ${duration / 1000}s linear`;
                progress.style.width = '100%';
            }, 50);
        };

        const freezeProgress = () => {
            const frozen = getComputedStyle(progress).width;
            progress.style.transition = 'none';
            progress.style.width = frozen;
        };

        const resumeProgress = (duration) => {
            progress.style.transition = `width ${duration / 1000}s linear`;
            progress.style.width = '100%';
        };

        const startStory = (index) => {
            isPaused = false;
            remainingTime = STORY_DURATION;
            storyStartTime = Date.now();
            clearTimeout(storyTimer);
            pauseIcon.classList.add('hidden');

            const story = stories[index];

            const rawPhone = story.whatsapp || story.author?.whatsapp || story.author?.phone || story.phone || '';
            const whatsappNumber = utils.normalizeWhatsAppNumber(rawPhone);
            let promptButtonHtml = '';
            if (whatsappNumber) {
                const defaultMessage = 'Olá! Vi seu story no PROMOCITY e me interessei. Poderia me dar mais informações?';
                const encodedMessage = encodeURIComponent(defaultMessage);
                const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;
                promptButtonHtml = `
                    <a 
                        href="${whatsappUrl}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="story-prompt-btn"
                        aria-label="Abrir contato do story"
                        title="Contato"
                        data-story-whatsapp-url="${whatsappUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"
                    >
                        <i class="fab fa-whatsapp"></i>
                    </a>
                `;
            }

            const caption = String(story.caption || '').trim();
            const safeCaption = esc(caption || '');
            const captionHtml = `<p class="story-caption">${safeCaption}</p>`;
            const authorName = esc(story.author?.business_name || story.author?.name || 'Comerciante');
            const authorAvatarRaw = story.author?.avatar_url
                ? story.author.avatar_url
                : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23333'/%3E%3C/svg%3E";
            const authorAvatar = safeUrl(authorAvatarRaw, "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23333'/%3E%3C/svg%3E");
            const storyImage = safeUrl(story.image_url, "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='800' viewBox='0 0 400 800'%3E%3Crect width='400' height='800' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23aaa' font-size='24' font-family='Arial'%3EImagem não disponível%3C/text%3E%3C/svg%3E");
            const storyIdJs = JSON.stringify(String(story.id ?? '')).replace(/"/g, '&quot;');
            const isAuthor = auth.currentUser && auth.currentUser.id === story.author?.id;

            // Conteúdo principal: imagem + rodapé (dentro do story-content).
            // onerror usa data URI sem aspas simples para não quebrar o atributo HTML.
            const storyFallbackSvg = 'data:image/svg+xml,' + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800">' +
                '<rect fill="#333" width="400" height="800"/>' +
                '<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" ' +
                'font-family="Arial" font-size="22" fill="#aaa">Imagem indisponi&#x301;vel</text>' +
                '</svg>'
            );
            content.innerHTML = `
                <img src="${storyImage}" alt="Story" onerror="this.onerror=null;this.src='${storyFallbackSvg}'">
                <div class="story-bottombar">
                    ${captionHtml}
                    ${promptButtonHtml}
                    ${isAuthor ? `
                        <button class="story-delete-btn" onclick="app.deleteStory(${storyIdJs})">
                            <i class="fas fa-trash"></i> Excluir
                        </button>
                    ` : ''}
                </div>
            `;

            // Topbar: filho direto do viewer (fora do story-content para evitar clipping).
            // Construído via DOM — evita bug de aspas simples em onerror/data-URI.
            const oldTopbar = viewer.querySelector('.story-topbar');
            if (oldTopbar) oldTopbar.remove();

            const topbar = document.createElement('div');
            topbar.className = 'story-topbar';

            // Grupo esquerdo: avatar + nome
            const authorDiv = document.createElement('div');
            authorDiv.className = 'story-author';

            const avatarImg = document.createElement('img');
            avatarImg.className = 'story-author-avatar';
            avatarImg.alt = authorName;
            avatarImg.src = authorAvatar;
            avatarImg.onerror = function () {
                this.onerror = null;
                // SVG inline sem dependência de URL externa
                this.src = 'data:image/svg+xml,' + encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">' +
                    '<rect fill="#555" width="40" height="40"/>' +
                    '<text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" ' +
                    'font-family="Arial" font-size="20" fill="#aaa">?</text></svg>'
                );
            };

            const nameSpan = document.createElement('span');
            nameSpan.className = 'story-author-name';
            nameSpan.textContent = authorName; // textContent — seguro, sem XSS

            authorDiv.appendChild(avatarImg);
            authorDiv.appendChild(nameSpan);

            // Botão fechar
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'story-close story-close-inline';
            closeBtn.dataset.storyClose = '';
            closeBtn.setAttribute('aria-label', 'Fechar story');
            closeBtn.title = 'Fechar';
            closeBtn.innerHTML = '<i class="fas fa-times"></i>';

            topbar.appendChild(authorDiv);
            topbar.appendChild(closeBtn);
            viewer.appendChild(topbar);

            const promptBtn = content.querySelector('.story-prompt-btn');
            if (promptBtn) {
                promptBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const url = this.getAttribute('data-story-whatsapp-url') || this.getAttribute('href');
                    if (url) {
                        const w = window.open(url, '_blank', 'noopener,noreferrer');
                        if (!w || w.closed) window.location.href = url;
                    }
                });
            }

            const inlineCloseBtn = viewer.querySelector('[data-story-close]');
            if (inlineCloseBtn) {
                inlineCloseBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    closeClean();
                });
            }

            startProgress(STORY_DURATION);
            storyTimer = setTimeout(advance, STORY_DURATION);
        };

        const pauseStory = () => {
            if (isPaused) return;
            isPaused = true;
            const elapsed = Date.now() - storyStartTime;
            remainingTime = Math.max(STORY_DURATION - elapsed, 200);
            clearTimeout(storyTimer);
            freezeProgress();
            pauseIcon.classList.remove('hidden');
        };

        const resumeStory = () => {
            if (!isPaused) return;
            isPaused = false;
            storyStartTime = Date.now();
            storyTimer = setTimeout(advance, remainingTime);
            resumeProgress(remainingTime);
            pauseIcon.classList.add('hidden');
        };

        // Remove listeners antigos do viewer para não acumular
        if (viewer._storyInteract) {
            const { down, up, leave } = viewer._storyInteract;
            viewer.removeEventListener('mousedown', down);
            viewer.removeEventListener('mouseup', up);
            viewer.removeEventListener('mouseleave', leave);
            viewer.removeEventListener('touchstart', down);
            viewer.removeEventListener('touchend', up);
            viewer.removeEventListener('touchcancel', leave);
        }
        if (content._storyClickHandler) {
            content.removeEventListener('click', content._storyClickHandler);
            content._storyClickHandler = null;
        }

        // Remove botões nav legados (substituídos por tap lateral)
        const oldNext = document.getElementById('next-story');
        if (oldNext) oldNext.remove();
        const oldPrev = document.getElementById('prev-story');
        if (oldPrev) oldPrev.remove();

        // ── Helpers de navegação ──
        const goNext = () => {
            if (isPaused) resumeStory();
            advance();
        };
        const goPrev = () => {
            if (isPaused) resumeStory();
            if (currentIndex > 0) {
                currentIndex--;
                startStory(currentIndex);
            } else if (onPrevGroup) {
                closeClean();
                onPrevGroup();
            }
        };

        // ── Estado de interação ──
        const HOLD_DELAY   = 180;   // ms → considera hold
        const SWIPE_MIN    = 50;    // px → considera swipe
        const TAP_MAX_MS   = 280;   // ms → considera tap
        const TAP_MAX_MOVE = 20;    // px → considera tap (sem arrastar)

        let ptStartX = 0, ptStartY = 0, ptStartTime = 0;
        let isHolding = false;
        let holdTimer = null;

        const IGNORE_SELECTORS = '.story-prompt-btn,.story-delete-btn,.story-close,.story-topbar,.story-bottombar';

        const onDown = (e) => {
            if (e.target.closest(IGNORE_SELECTORS)) return;
            const pt = e.touches ? e.touches[0] : e;
            ptStartX = pt.clientX;
            ptStartY = pt.clientY;
            ptStartTime = Date.now();
            isHolding = false;
            clearTimeout(holdTimer);
            holdTimer = setTimeout(() => {
                isHolding = true;
                pauseStory();
            }, HOLD_DELAY);
        };

        const onUp = (e) => {
            clearTimeout(holdTimer);
            if (e.target.closest(IGNORE_SELECTORS)) {
                if (isHolding) { resumeStory(); isHolding = false; }
                return;
            }
            const pt = e.changedTouches ? e.changedTouches[0] : e;
            const dx = pt.clientX - ptStartX;
            const dy = pt.clientY - ptStartY;
            const dt = Date.now() - ptStartTime;

            // Se estava em hold → apenas retomar
            if (isHolding) {
                resumeStory();
                isHolding = false;
                return;
            }

            // Swipe horizontal
            if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
                if (dx < 0) goNext();
                else goPrev();
                return;
            }

            // Tap (curto, sem movimento)
            if (dt < TAP_MAX_MS && Math.abs(dx) < TAP_MAX_MOVE && Math.abs(dy) < TAP_MAX_MOVE) {
                const w = window.innerWidth;
                if (pt.clientX < w * 0.3) goPrev();
                else if (pt.clientX > w * 0.7) goNext();
                // centro → ignora (sem ação)
            }
        };

        const onLeave = () => {
            clearTimeout(holdTimer);
            if (isHolding) { resumeStory(); isHolding = false; }
        };

        viewer._storyInteract = { down: onDown, up: onUp, leave: onLeave };
        viewer.addEventListener('mousedown', onDown);
        viewer.addEventListener('mouseup', onUp);
        viewer.addEventListener('mouseleave', onLeave);
        viewer.addEventListener('touchstart', onDown, { passive: true });
        viewer.addEventListener('touchend', onUp);
        viewer.addEventListener('touchcancel', onLeave);

        viewer.classList.remove('hidden');
        startStory(0);

        const newCloseBtn = document.getElementById('close-story');
        if (newCloseBtn) {
            newCloseBtn.onclick = () => closeClean();
        }
    },

    /**
     * Fecha o visualizador de stories
     */
    closeStoryViewer() {
        const viewer = this.elements.screens.story;
        viewer.classList.add('hidden');

        // Remove listeners de interação
        if (viewer._storyInteract) {
            const { down, up, leave } = viewer._storyInteract;
            viewer.removeEventListener('mousedown', down);
            viewer.removeEventListener('mouseup', up);
            viewer.removeEventListener('mouseleave', leave);
            viewer.removeEventListener('touchstart', down);
            viewer.removeEventListener('touchend', up);
            viewer.removeEventListener('touchcancel', leave);
            viewer._storyInteract = null;
        }

        // Remove elementos dinâmicos
        const next = document.getElementById('next-story');
        if (next) next.remove();
        const prev = document.getElementById('prev-story');
        if (prev) prev.remove();
        const pauseIcon = viewer.querySelector('.story-pause-icon');
        if (pauseIcon) pauseIcon.remove();
        const oldTopbar = viewer.querySelector('.story-topbar');
        if (oldTopbar) oldTopbar.remove();

        const content = document.getElementById('story-content');
        if (content && content._storyClickHandler) {
            content.removeEventListener('click', content._storyClickHandler);
            content._storyClickHandler = null;
        }
    },

    /**
     * Renderiza feed de promoções
     */
    renderFeed(promotions, container = this.elements.feed) {
        if (!promotions || promotions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>Nenhuma promoção encontrada</p>
                </div>
            `;
            return;
        }

        const hotPromos = promotions.filter(p => p.is_hot);
        console.log('[renderFeed] promos HOT:', hotPromos.length,
            hotPromos.map(p => ({ id: p.id, expires_at: p.expires_at })));

        const html = promotions.map(promo => this.createPromoCard(promo)).join('');
        container.innerHTML = html;
        this.startCountdownManager();
    },

    /**
     * Cria card de promoção - com botão WhatsApp e perfil clicável
     */
    createPromoCard(promo) {
        const esc = utils.escapeHTML || utils.sanitizeInput;
        const safeUrl = (url, fallback = '') => (
            utils.sanitizeUrl ? utils.sanitizeUrl(url, { fallback, allowDataImage: true }) : (url || fallback)
        );
        const isHot = promo.is_hot;
        const discount = promo.old_price ? 
            Math.round(((promo.old_price - promo.new_price) / promo.old_price) * 100) : 0;

        const avatarUrlRaw = promo.author.avatar_url 
            ? promo.author.avatar_url 
            : 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'40\' viewBox=\'0 0 40 40\'%3E%3Crect width=\'40\' height=\'40\' fill=\'%23333\'/%3E%3C/svg%3E';
        const avatarUrl = safeUrl(avatarUrlRaw, 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'40\' viewBox=\'0 0 40 40\'%3E%3Crect width=\'40\' height=\'40\' fill=\'%23333\'/%3E%3C/svg%3E');

        const placeholderImage = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'400\' height=\'300\' viewBox=\'0 0 400 300\'%3E%3Crect width=\'400\' height=\'300\' fill=\'%23cccccc\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\' fill=\'%23999\' font-size=\'24\' font-family=\'Arial\'%3EImagem não disponível%3C/text%3E%3C/svg%3E';
        const promoImage = safeUrl(promo.image_url, placeholderImage);

        const isAuthor = auth.currentUser && auth.currentUser.id === promo.author.id;
        // JSON.stringify produz "string" com aspas duplas. Dentro de onclick="..."
        // (também aspas duplas), essas aspas internas terminam o atributo prematuramente,
        // causando "Unexpected end of input". &quot; é decodificado para " pelo HTML parser
        // antes da execução do JS, tornando o onclick sintaticamente correto.
        const promoIdJs = JSON.stringify(String(promo.id ?? '')).replace(/"/g, '&quot;');
        const promoIdAttr = esc(String(promo.id ?? ''));
        const authorIdJs = JSON.stringify(String(promo.author.id ?? '')).replace(/"/g, '&quot;');
        const safeAuthorName = esc(promo.author.business_name || promo.author.name || '');
        const safeTitle = esc(promo.title || '');
        const safeDescription = esc(promo.description || '');
        const safeCreatedAt = esc(utils.formatRelativeTime(promo.created_at));

        // Botão WhatsApp para a promoção
        const whatsappNumber = utils.normalizeWhatsAppNumber(promo.author?.phone || '');
        let whatsappLink = '';
        if (whatsappNumber) {
            const message = encodeURIComponent(`Olá! Vi sua promoção "${promo.title}" no PROMOCITY e me interessei. Ainda está disponível?`);
            whatsappLink = `https://wa.me/${whatsappNumber}?text=${message}`;
        }
        const safeWhatsappLink = safeUrl(whatsappLink, '#');

        return `
            <article class="promo-card${isAuthor ? ' promo-card--has-owner-menu' : ''}" data-id="${promoIdAttr}">
                ${isAuthor ? `
                <div class="promo-card-owner-menu-host">
                    <button type="button" class="promo-card-menu-trigger" aria-label="Mais opções" aria-expanded="false" aria-haspopup="true">
                        <i class="fas fa-ellipsis-vertical" aria-hidden="true"></i>
                    </button>
                    <div class="promo-card-owner-dropdown" role="menu">
                        <button type="button" class="promo-card-menu-item" role="menuitem" onclick="app.editPromo(${promoIdJs})" title="Editar">
                            <span class="promo-card-menu-item-icon" aria-hidden="true">✏️</span>
                            <span class="promo-card-menu-item-label">Editar</span>
                        </button>
                        <button type="button" class="promo-card-menu-item promo-card-menu-item-danger" role="menuitem" onclick="app.confirmDeletePromo(${promoIdJs})" title="Excluir">
                            <span class="promo-card-menu-item-icon" aria-hidden="true">🗑️</span>
                            <span class="promo-card-menu-item-label">Excluir</span>
                        </button>
                    </div>
                </div>
                ` : ''}
                <div class="promo-header">
                    <div class="promo-author" onclick="app.loadProfileByAuthor(${authorIdJs})" style="cursor: pointer;">
                        <img src="${avatarUrl}" 
                             alt="${safeAuthorName}" class="author-avatar"
                             onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'40\' viewBox=\'0 0 40 40\'%3E%3Crect width=\'40\' height=\'40\' fill=\'%23333\'/%3E%3C/svg%3E'">
                        <div class="author-info">
                            <h4>${safeAuthorName}</h4>
                            <span>${safeCreatedAt}</span>
                        </div>
                    </div>
                    ${isHot
                        ? '<span class="promo-badge hot">HOT 🔥</span>'
                        : '<span class="promo-badge new">NOVO</span>'
                    }
                </div>
                
                <div class="promo-image-wrap">
                    <img src="${promoImage}" 
                         alt="${safeTitle}" 
                         class="promo-image" 
                         loading="lazy"
                         onerror="this.src='${placeholderImage}'">
                    ${isHot
                        ? `<div class="promo-badge hot promo-hot-countdown-overlay" data-expires-at="${esc(promo.expires_at || '')}"><span class="hot-countdown-wrap"><span class="hot-countdown-icon" aria-hidden="true">⏳</span><span class="hot-countdown"></span></span></div>`
                        : ''
                    }
                </div>
                
                <div class="promo-content">
                    <h3 class="promo-title">${safeTitle}</h3>
                    <p class="promo-description">${safeDescription}</p>
                    
                    <div class="promo-prices">
                        <div class="promo-price-main">
                            <span class="promo-price-label">Preço</span>
                            <span class="new-price">${utils.formatCurrency(promo.new_price)}</span>
                        </div>
                        <div class="promo-price-meta">
                            ${promo.old_price ? `<span class="old-price">de ${utils.formatCurrency(promo.old_price)}</span>` : ''}
                            ${discount > 0 ? `<span class="discount-badge">-${discount}%</span>` : ''}
                        </div>
                    </div>
                    
                    <div class="promo-actions">
                        <div class="action-group">
                            <button type="button" class="action-btn action-btn-like ${promo.isLiked ? 'active' : ''}" onclick="app.likePromo(${promoIdJs})" title="Fogo">
                                <i class="fas fa-fire ${promo.isLiked ? 'fire-on' : 'fire-off'}"></i>
                                <span>${promo.likes_count || 0}</span>
                            </button>
                            <button type="button" class="action-btn" onclick="app.openComments(${promoIdJs})" title="Comentários">
                                <i class="far fa-comment"></i>
                                <span>${promo.comments_count ?? 0}</span>
                            </button>
                            <button type="button" class="action-btn" onclick="app.sharePromo(${promoIdJs})" title="Compartilhar">
                                <i class="fas fa-share-alt"></i>
                            </button>
                            ${safeWhatsappLink && safeWhatsappLink !== '#' ? `
                                <button type="button" class="action-btn action-btn-whatsapp" onclick="window.open('${safeWhatsappLink}', '_blank')" title="WhatsApp">
                                    <i class="fab fa-whatsapp"></i>
                                </button>
                            ` : ''}
                        </div>
                        <div class="action-group action-group-secondary">
                            ${isAuthor ? `
                                <div class="promo-owner-actions-hidden" aria-hidden="true">
                                <button type="button" class="action-btn" onclick="app.editPromo(${promoIdJs})" title="Editar">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button type="button" class="action-btn" onclick="app.confirmDeletePromo(${promoIdJs})" title="Excluir">
                                    <i class="fas fa-trash-alt" style="color: var(--error);"></i>
                                </button>
                                </div>
                            ` : ''}
                            <button type="button" class="action-btn action-btn-favorite ${promo.isFavorited ? 'active' : ''}" onclick="app.toggleFavorite(${promoIdJs})" title="Salvar">
                                <i class="${promo.isFavorited ? 'fas' : 'far'} fa-bookmark"></i>
                            </button>
                        </div>
                        ${!isAuthor && auth.currentUser ? `
                            <button type="button" class="btn btn-delivery" onclick="app.openDeliveryRequest(${promoIdJs})">
                                <i class="fas fa-motorcycle"></i> Pedir com entrega
                            </button>
                        ` : ''}
                    </div>
                </div>
            </article>
        `;
    },

    /**
     * Renderiza lista de comentários no modal
     */
    renderComments(comments) {
        const list = this.elements.commentsList;
        if (!list) return;
        const esc = utils.escapeHTML || utils.sanitizeInput;
        const safeUrl = (url, fallback = '') => (
            utils.sanitizeUrl ? utils.sanitizeUrl(url, { fallback, allowDataImage: true }) : (url || fallback)
        );

        if (!comments || comments.length === 0) {
            list.innerHTML = '<p class="comments-empty">Nenhum comentário ainda. Seja o primeiro!</p>';
            return;
        }

        const defaultAvatar = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'36\' height=\'36\' viewBox=\'0 0 36 36\'%3E%3Crect width=\'36\' height=\'36\' fill=\'%23333\'/%3E%3C/svg%3E';
        list.innerHTML = comments.map(c => {
            const author = c.author || {};
            const name = esc(author.business_name || author.name || 'Usuário');
            const avatar = safeUrl(author.avatar_url, defaultAvatar);
            const safeComment = esc(c.text || '');
            const safeCreatedAt = esc(utils.formatRelativeTime(c.created_at));
            const safeCommentId = esc(String(c.id ?? ''));
            return `
                <div class="comment-item" data-comment-id="${safeCommentId}">
                    <img src="${avatar}" alt="${name}" class="comment-avatar" loading="lazy" onerror="this.src='${defaultAvatar}'">
                    <div class="comment-body">
                        <div class="comment-author">${name}</div>
                        <div class="comment-text">${safeComment}</div>
                        <div class="comment-time">${safeCreatedAt}</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    showCommentsModal(show = true) {
        const modal = this.elements.commentsModal;
        if (!modal) return;
        modal.classList.toggle('hidden', !show);
        if (show && this.elements.commentInput) this.elements.commentInput.value = '';
    },

    updateCommentCountOnCard(promoId, count) {
        const card = document.querySelector(`.promo-card[data-id="${promoId}"]`);
        if (!card) return;
        const btn = card.querySelector('.action-btn .fa-comment')?.closest('.action-btn');
        if (btn) {
            const span = btn.querySelector('span');
            if (span) span.textContent = count;
        }
    },

    /**
     * Renderiza perfil do usuário
     * AGORA DIFERENCIA: dono do perfil vs visitante
     */
    renderProfile(user) {
        const esc = utils.escapeHTML || utils.sanitizeInput;
        const safeUrl = (url, fallback = '#', allowDataImage = false) => (
            utils.sanitizeUrl ? utils.sanitizeUrl(url, { fallback, allowDataImage }) : (url || fallback)
        );
        
        if (!user) {
            console.error('❌ Erro: user é null ou undefined');
            this.elements.profile.innerHTML = '<div class="error-state">Erro: dados de usuário não encontrados</div>';
            return;
        }

        if (!user.profile) {
            console.error('❌ Erro: user.profile não existe');
            this.elements.profile.innerHTML = '<div class="error-state">Erro: perfil não encontrado</div>';
            return;
        }

        try {
            const profile = user.profile;
            const isMerchant = profile.user_type === 'merchant';
            
            // ===== NOVO: Verifica se é o dono do perfil =====
            const isOwner = auth.currentUser && auth.currentUser.id === user.id;



            const activePromotions = Number(profile.promotions_count) || 0;

            // Informações customizadas do comerciante (store_info: [{icon, label, value}])
            let storeInfoItems = [];
            try {
                const raw = profile.store_info;
                if (Array.isArray(raw)) storeInfoItems = raw;
                else if (typeof raw === 'string' && raw.trim()) storeInfoItems = JSON.parse(raw);
            } catch (_) { storeInfoItems = []; }

            const storeInfoGridHtml = storeInfoItems.length
                ? storeInfoItems.map(item => `
                    <div class="merchant-business-item${item.wide ? ' merchant-business-item-wide' : ''}">
                        <span class="merchant-business-label"><i class="${esc(item.icon || 'fas fa-info-circle')}"></i> ${esc(item.label || '')}</span>
                        <strong class="merchant-business-value">${esc(item.value || '')}</strong>
                    </div>`).join('')
                : '';

            const avatarUrl = profile.avatar_url 
                ? profile.avatar_url 
                : 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'120\' height=\'120\' viewBox=\'0 0 120 120\'%3E%3Crect width=\'120\' height=\'120\' fill=\'%23333\'/%3E%3C/svg%3E';
            const safeAvatarUrl = safeUrl(
                avatarUrl,
                'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'120\' height=\'120\' viewBox=\'0 0 120 120\'%3E%3Crect width=\'120\' height=\'120\' fill=\'%23333\'/%3E%3C/svg%3E',
                true
            );

            const name = isMerchant ? (profile.business_name || profile.name) : profile.name;
            const safeName = esc(name || '');
            const safeProfileName = esc(profile.name || '');
            const safeProfileEmail = esc(profile.email || '');
            const safeProfilePhone = esc(profile.phone || '');
            const safeBusinessAddress = esc(profile.business_address || 'Não informado');
            const safeBusinessCategory = esc(profile.business_category || 'Não informada');

            // Botão WhatsApp do perfil
            const whatsappNumber = utils.normalizeWhatsAppNumber(profile.phone || '');
            let whatsappLink = '';
            if (whatsappNumber) {
                const message = encodeURIComponent('Olá! Vi seu perfil no PROMOCITY e gostaria de mais informações.');
                whatsappLink = `https://wa.me/${whatsappNumber}?text=${message}`;
            }
            const safeWhatsappLink = safeUrl(whatsappLink, '#');

            // Link da loja virtual
            const storeLink = profile.business_store_link;
            const safeStoreLink = safeUrl(storeLink, '#');
            const safeStoreLinkText = esc(storeLink || '');

            // ── HEADER DO PERFIL ──────────────────────────────────────────────────
            // Comerciante → hero premium com info bar + botões de ação
            // Consumidor  → estrutura original inalterada

            const _catMap = { food: 'Alimentação', clothing: 'Vestuário', services: 'Serviços', health: 'Saúde', tech: 'Tecnologia', other: 'Outros' };
            const categoryDisplayLabel = isMerchant
                ? esc(_catMap[profile.business_category] || profile.business_category || 'Comércio Local')
                : '';
            const shortAddr = (isMerchant && profile.business_address)
                ? esc(profile.business_address.split(',')[0].trim())
                : null;

            let html;

            if (isMerchant) {
                // ── COVER IMAGE (capa do perfil) ───────────────────────────────────
                const coverUrl = profile.cover_url || null;
                const safeCoverUrl = coverUrl ? safeUrl(coverUrl, '', true) : null;

                // ── HERO COMERCIAL PREMIUM ─────────────────────────────────────────
                html = `
                    <div class="profile-header merchant-profile-hero${safeCoverUrl ? ' has-cover' : ''}">
                        <div class="profile-cover-bg">
                            ${safeCoverUrl ? `<img src="${safeCoverUrl}" class="profile-cover-img" alt="Foto de capa" onerror="this.style.display='none'">` : ''}
                            <div class="profile-cover-overlay"></div>
                        </div>
                        <img src="${safeAvatarUrl}" alt="${safeName}" class="profile-avatar"
                             onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'120\' height=\'120\' viewBox=\'0 0 120 120\'%3E%3Crect width=\'120\' height=\'120\' fill=\'%23333\'/%3E%3C/svg%3E'">
                        <h2 class="profile-name">${safeName}</h2>
                        <span class="profile-type">
                            <i class="fas fa-store"></i> ${categoryDisplayLabel || 'Comerciante'}
                        </span>
                        <div class="merchant-hero-rating">
                            <span class="merchant-hero-stars">★★★★★</span>
                            <span class="merchant-hero-score">4.8</span>
                            <span class="merchant-hero-reviews">Avaliações</span>
                        </div>
                        ${storeInfoItems.length ? `
                        <button class="merchant-info-toggle" onclick="(function(btn){var grid=btn.nextElementSibling;var open=grid.classList.toggle('merchant-business-grid--open');btn.querySelector('.merchant-info-toggle-icon').style.transform=open?'rotate(180deg)':'rotate(0deg)';btn.querySelector('.merchant-info-toggle-text').textContent=open?'Ocultar informações':'Ver informações da loja';})(this)" type="button">
                            <i class="fas fa-info-circle"></i>
                            <span class="merchant-info-toggle-text">Ver informações da loja</span>
                            <i class="fas fa-chevron-down merchant-info-toggle-icon" style="transition:transform 0.25s;"></i>
                        </button>
                        <div class="merchant-business-grid">
                            <div class="merchant-business-item">
                                <span class="merchant-business-label"><i class="fas fa-bolt"></i> Promoções ativas</span>
                                <strong class="merchant-business-value">${activePromotions}</strong>
                            </div>
                            ${storeInfoGridHtml}
                        </div>` : `
                        <div class="merchant-business-grid merchant-business-grid--open" style="margin-top:0.75rem;">
                            <div class="merchant-business-item merchant-business-item-wide">
                                <span class="merchant-business-label"><i class="fas fa-bolt"></i> Promoções ativas</span>
                                <strong class="merchant-business-value">${activePromotions}</strong>
                            </div>
                        </div>`}
                    </div>

                    ${(shortAddr || categoryDisplayLabel || (safeStoreLink && safeStoreLink !== '#')) ? `
                    <div class="merchant-info-bar">
                        ${shortAddr ? `<div class="merchant-info-item"><i class="fas fa-map-marker-alt"></i><span>${shortAddr}</span></div>` : ''}
                        ${categoryDisplayLabel ? `<div class="merchant-info-item"><i class="fas fa-tag"></i><span>${categoryDisplayLabel}</span></div>` : ''}
                        ${safeStoreLink && safeStoreLink !== '#' ? `<div class="merchant-info-item"><i class="fas fa-globe"></i><a href="${safeStoreLink}" target="_blank" rel="noopener noreferrer" class="merchant-store-link">${safeStoreLinkText || 'Loja virtual'}</a></div>` : ''}
                    </div>
                    ` : ''}

                    <div class="merchant-action-row">
                        ${isOwner ? `
                            <button type="button" class="merchant-action-btn merchant-btn-publish" onclick="app.navigateToPublish()">
                                <i class="fas fa-plus-circle"></i> Nova promoção
                            </button>
                            <button type="button" class="merchant-action-btn merchant-btn-orders" onclick="app.openMerchantOrders()">
                                <i class="fas fa-shopping-bag"></i> Pedidos
                            </button>
                        ` : `
                            <button type="button" class="merchant-action-btn merchant-btn-delivery"
                                onclick="(function(){var c=document.getElementById('profile-content');if(c){var p=c.querySelector('.store-block-promos');if(p)p.scrollIntoView({behavior:'smooth'});}})()">
                                <i class="fas fa-motorcycle"></i> Pedido com entrega
                            </button>
                            ${safeWhatsappLink && safeWhatsappLink !== '#' ? `
                            <a href="${safeWhatsappLink}" target="_blank" rel="noopener noreferrer"
                               class="merchant-action-btn merchant-btn-whatsapp">
                                <i class="fab fa-whatsapp"></i> WhatsApp
                            </a>` : ''}
                        `}
                    </div>
                `;
            } else {
                // ── PERFIL CONSUMIDOR (estrutura original inalterada) ───────────────
                html = `
                    <div class="profile-header">
                        <img src="${safeAvatarUrl}" alt="${safeName}" class="profile-avatar"
                             onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'120\' height=\'120\' viewBox=\'0 0 120 120\'%3E%3Crect width=\'120\' height=\'120\' fill=\'%23333\'/%3E%3C/svg%3E'">
                        <h2 class="profile-name">${safeName}</h2>
                        <span class="profile-type">
                            <i class="fas fa-user"></i>
                            Consumidor
                        </span>
                    </div>
                `;
            }

            // Informações detalhadas: apenas consumidores (dono ou visitante)
            if (!isMerchant) {
                html += `
                <div class="profile-info">
                    <div class="info-item">
                        <i class="fas fa-user"></i>
                        <div class="info-content">
                            <span class="info-label">Nome</span>
                            <span class="info-value">${safeProfileName}</span>
                        </div>
                    </div>
                    
                    <div class="info-item">
                        <i class="fas fa-envelope"></i>
                        <div class="info-content">
                            <span class="info-label">Email</span>
                            <span class="info-value">${safeProfileEmail}</span>
                        </div>
                    </div>
                    
                    <div class="info-item">
                        <i class="fas fa-phone"></i>
                        <div class="info-content">
                            <span class="info-label">WhatsApp</span>
                            <span class="info-value">${safeProfilePhone}</span>
                        </div>
                    </div>
                </div>
                `;
            }

            // Botão WhatsApp flutuante — apenas para perfis de consumidor
            // (comerciantes têm o WhatsApp na linha de ação do hero, não aqui)
            if (!isMerchant && safeWhatsappLink && safeWhatsappLink !== '#') {
                html += `
                    <a href="${safeWhatsappLink}" target="_blank" class="btn btn-primary btn-block profile-whatsapp-cta" aria-label="Conversar no WhatsApp" title="Conversar no WhatsApp">
                        <i class="fab fa-whatsapp"></i>
                        <span class="profile-whatsapp-cta-label">Conversar no WhatsApp</span>
                    </a>
                `;
            }

            // Dono comerciante: vitrine de produtos (igual visitante, sem carrinho) + dados no menu
            if (isOwner && isMerchant) {
                html += this._buildStoreGrid(profile, { ownerView: true });
                html += `
                <div id="merchant-profile-details" class="merchant-profile-details hidden" aria-hidden="true">
                    <div class="profile-info">
                        <div class="info-item">
                            <i class="fas fa-user"></i>
                            <div class="info-content">
                                <span class="info-label">Nome</span>
                                <span class="info-value">${safeProfileName}</span>
                            </div>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-envelope"></i>
                            <div class="info-content">
                                <span class="info-label">Email</span>
                                <span class="info-value">${safeProfileEmail}</span>
                            </div>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-phone"></i>
                            <div class="info-content">
                                <span class="info-label">WhatsApp</span>
                                <span class="info-value">${safeProfilePhone}</span>
                            </div>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-map-marker-alt"></i>
                            <div class="info-content">
                                <span class="info-label">Endereço</span>
                                <span class="info-value">${safeBusinessAddress}</span>
                            </div>
                        </div>
                        <div class="info-item">
                            <i class="fas fa-tag"></i>
                            <div class="info-content">
                                <span class="info-label">Categoria</span>
                                <span class="info-value">${safeBusinessCategory}</span>
                            </div>
                        </div>
                        ${safeStoreLink && safeStoreLink !== '#' ? `
                            <div class="info-item">
                                <i class="fas fa-store"></i>
                                <div class="info-content">
                                    <span class="info-label">Loja Virtual</span>
                                    <a href="${safeStoreLink}" target="_blank" class="info-value store-link">${safeStoreLinkText}</a>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    <p class="merchant-profile-details-hint"><i class="fas fa-info-circle"></i> Para alterar estes dados, use <strong>Editar perfil</strong> no menu abaixo.</p>
                </div>
                `;
            }

            // ===== MENU DO PERFIL (dono): lista em estilo app profissional =====
            if (isOwner) {
                html += `<div class="profile-menu">`;

                if (isMerchant) {
                    html += `
                    <div class="profile-menu-group">
                        <div class="profile-menu-group-title">Minha loja</div>
                        <button type="button" class="profile-menu-item" onclick="ui.toggleMerchantProfileDetails()">
                            <span class="profile-menu-item-icon"><i class="fas fa-id-card"></i></span>
                            <span class="profile-menu-item-label">Dados da loja e contato</span>
                            <i class="fas fa-chevron-right profile-menu-item-arrow"></i>
                        </button>
                    </div>
                    `;
                }

                // Grupo: Conta
                html += `
                    <div class="profile-menu-group">
                        <div class="profile-menu-group-title">Conta</div>
                        <button type="button" class="profile-menu-item" onclick="app.editProfile()">
                            <span class="profile-menu-item-icon"><i class="fas fa-edit"></i></span>
                            <span class="profile-menu-item-label">Editar perfil</span>
                            <i class="fas fa-chevron-right profile-menu-item-arrow"></i>
                        </button>
                `;

                // Grupo: Negócio (comerciante)
                if (isMerchant) {
                    html += `
                        <div class="profile-menu-group-title">Negócio</div>
                        <button type="button" class="profile-menu-item" onclick="app.navigateToPublish()">
                            <span class="profile-menu-item-icon"><i class="fas fa-plus-circle"></i></span>
                            <span class="profile-menu-item-label">Publicar promoção</span>
                            <i class="fas fa-chevron-right profile-menu-item-arrow"></i>
                        </button>
                        <button type="button" class="profile-menu-item" onclick="app.openMerchantOrders()">
                            <span class="profile-menu-item-icon"><i class="fas fa-shopping-bag"></i></span>
                            <span class="profile-menu-item-label">Pedidos de entrega</span>
                            <i class="fas fa-chevron-right profile-menu-item-arrow"></i>
                        </button>
                        <button type="button" class="profile-menu-item profile-menu-item-secondary" onclick="app.downgradeToConsumer()">
                            <span class="profile-menu-item-icon"><i class="fas fa-user"></i></span>
                            <span class="profile-menu-item-label">Ser apenas consumidor</span>
                            <i class="fas fa-chevron-right profile-menu-item-arrow"></i>
                        </button>
                    `;
                }

                // Grupo: Consumidor (anunciar negócio)
                if (!isMerchant) {
                    html += `
                        <div class="profile-menu-group-title">Negócio</div>
                        <button type="button" class="profile-menu-item profile-menu-item-accent" onclick="app.upgradeToMerchant()">
                            <span class="profile-menu-item-icon"><i class="fas fa-store"></i></span>
                            <span class="profile-menu-item-label">Anunciar meu negócio</span>
                            <i class="fas fa-chevron-right profile-menu-item-arrow"></i>
                        </button>
                    `;
                }

                // Grupo: Entregas (motoboy ou opção de ser motoboy)
                const isMotoboy = profile.is_motoboy === true;
                if (isMotoboy) {
                    const vehicleLabel = { moto: 'Moto', bike: 'Bike', carro: 'Carro' }[profile.motoboy_vehicle] || 'Motoboy';
                    const available = profile.motoboy_available === true;
                    html += `
                        <div class="profile-menu-group-title">Entregas</div>
                        <div class="profile-motoboy-inline">
                            <span class="profile-motoboy-badge"><i class="fas fa-motorcycle"></i> ${vehicleLabel}</span>
                            <label class="checkbox-label">
                                <input type="checkbox" id="profile-motoboy-available" ${available ? 'checked' : ''} onchange="app.toggleMotoboyAvailable(this.checked)">
                                <span class="checkmark"></span> Disponível para entregas
                            </label>
                        </div>
                        <button type="button" class="profile-menu-item" onclick="app.openMotoboyDashboard()">
                            <span class="profile-menu-item-icon"><i class="fas fa-box"></i></span>
                            <span class="profile-menu-item-label">Ver entregas</span>
                            <i class="fas fa-chevron-right profile-menu-item-arrow"></i>
                        </button>
                        <button type="button" class="profile-menu-item profile-menu-item-secondary" onclick="app.deactivateMotoboy()">
                            <span class="profile-menu-item-icon"><i class="fas fa-user"></i></span>
                            <span class="profile-menu-item-label">Parar de ser motoboy</span>
                            <i class="fas fa-chevron-right profile-menu-item-arrow"></i>
                        </button>
                    `;
                } else if (isOwner && !isMerchant) {
                    html += `
                        <div class="profile-menu-group-title">Entregas</div>
                        <button type="button" class="profile-menu-item" onclick="app.openMyDeliveries()">
                            <span class="profile-menu-item-icon"><i class="fas fa-shopping-bag"></i></span>
                            <span class="profile-menu-item-label">Meus pedidos com entrega</span>
                            <i class="fas fa-chevron-right profile-menu-item-arrow"></i>
                        </button>
                        <button type="button" class="profile-menu-item profile-menu-item-accent" onclick="app.openMotoboyVehicleModal()">
                            <span class="profile-menu-item-icon"><i class="fas fa-motorcycle"></i></span>
                            <span class="profile-menu-item-label">Quero ser motoboy</span>
                            <i class="fas fa-chevron-right profile-menu-item-arrow"></i>
                        </button>
                    `;
                }

                // Sair da conta (grupo Conta, item de destaque)
                html += `
                        <div class="profile-menu-group-title">Sessão</div>
                        <button type="button" class="profile-menu-item profile-menu-item-danger" onclick="app.logout()">
                            <span class="profile-menu-item-icon"><i class="fas fa-sign-out-alt"></i></span>
                            <span class="profile-menu-item-label">Sair da conta</span>
                            <i class="fas fa-chevron-right profile-menu-item-arrow"></i>
                        </button>
                    </div>
                </div>
                `;
            } else if (isMerchant) {
                // ===== VISITANTE VENDO COMERCIANTE: exibe loja visual =====
                html += this._buildStoreGrid(profile);
            } else {
                // ===== VISITANTE VENDO CONSUMIDOR: mensagem sutil =====
                html += `
                    <div style="text-align: center; margin-top: 20px; padding: 15px; background: #f5f5f5; border-radius: 10px; color: #666;">
                        <i class="fas fa-eye"></i> Você está visualizando o perfil de ${safeName}
                    </div>
                `;
            }

            this.elements.profile.innerHTML = html;

            // Inicializa o carrinho ao entrar na loja do comerciante
            if (isMerchant && !isOwner) {
                this._initCart(user.id, profile.phone);
            }

        } catch (error) {
            console.error('❌ Erro em renderProfile:', error);
            this.elements.profile.innerHTML = `<div class="error-state">Erro ao renderizar perfil: ${error.message}</div>`;
        }
    },

    /**
     * Renderiza a tela de edição de perfil
     * AGORA COM SUPORTE A LATITUDE/LONGITUDE
     */
    renderEditProfile(user) {
        if (!user || !user.profile) return;

        const profile = user.profile;
        const isMerchant = profile.user_type === 'merchant';

        const avatarPreview = document.getElementById('edit-avatar-preview');
        if (avatarPreview) {
            avatarPreview.src = profile.avatar_url || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'120\' height=\'120\' viewBox=\'0 0 120 120\'%3E%3Crect width=\'120\' height=\'120\' fill=\'%23333\'/%3E%3C/svg%3E';
        }

        // Preenche preview da foto de capa
        const coverPreview = document.getElementById('edit-cover-preview');
        if (coverPreview) {
            coverPreview.src = profile.cover_url || '';
        }

        // Exibe/oculta a área de capa conforme tipo de usuário
        const photosEdit = document.getElementById('edit-cover-area');
        if (photosEdit) {
            if (isMerchant) {
                photosEdit.style.display = '';
            } else {
                // Consumidores: mostra avatar sem fundo de capa
                photosEdit.style.height = '0';
                photosEdit.style.overflow = 'hidden';
                photosEdit.style.marginBottom = '80px';
                const avatarEdit = document.getElementById('edit-avatar-area');
                if (avatarEdit) {
                    avatarEdit.style.bottom = '-70px';
                }
            }
        }

        document.getElementById('edit-name').value = profile.name || '';
        document.getElementById('edit-email').value = profile.email || '';
        document.getElementById('edit-phone').value = profile.phone || '';

        const merchantFields = document.getElementById('edit-merchant-fields');
        if (isMerchant) {
            merchantFields.classList.remove('hidden');
            
            document.getElementById('edit-business-name').value = profile.business_name || '';
            document.getElementById('edit-business-address').value = profile.business_address || '';
            document.getElementById('edit-business-category').value = profile.business_category || '';
            document.getElementById('edit-business-store-link').value = profile.business_store_link || '';
            
            // ========== Informações customizadas da loja ==========
            let existingInfoSection = document.getElementById('store-info-editor');
            if (!existingInfoSection) {
                existingInfoSection = document.createElement('div');
                existingInfoSection.id = 'store-info-editor';
                existingInfoSection.className = 'form-group';
                existingInfoSection.innerHTML = `
                    <label style="display:flex;align-items:center;justify-content:space-between;">
                        <span>Informações da loja</span>
                        <button type="button" id="btn-add-store-info" class="store-info-add-btn">
                            <i class="fas fa-plus"></i> Adicionar
                        </button>
                    </label>
                    <div id="store-info-list" class="store-info-list"></div>
                    <p class="field-note">Adicione informações relevantes para seus clientes: horário, entrega, agendamento, etc.</p>
                `;
                merchantFields.appendChild(existingInfoSection);
            }

            const STORE_INFO_ICONS = [
                { value: 'fas fa-clock',            label: 'Horário' },
                { value: 'fas fa-motorcycle',        label: 'Entrega' },
                { value: 'fas fa-wallet',            label: 'Taxa de entrega' },
                { value: 'fas fa-receipt',           label: 'Pedido mínimo' },
                { value: 'fas fa-store',             label: 'Status da loja' },
                { value: 'fas fa-calendar-alt',      label: 'Agendamento' },
                { value: 'fas fa-handshake',         label: 'Atendimento' },
                { value: 'fas fa-phone',             label: 'Telefone' },
                { value: 'fas fa-map-marker-alt',    label: 'Localização' },
                { value: 'fas fa-tag',               label: 'Preço / Condição' },
                { value: 'fas fa-star',              label: 'Destaque' },
                { value: 'fas fa-truck',             label: 'Frete' },
                { value: 'fas fa-box',               label: 'Produto' },
                { value: 'fas fa-bolt',              label: 'Promoção' },
                { value: 'fas fa-info-circle',       label: 'Informação' },
                { value: 'fas fa-cut',               label: 'Serviço' },
                { value: 'fas fa-utensils',          label: 'Alimentação' },
                { value: 'fas fa-tshirt',            label: 'Moda' },
                { value: 'fas fa-tools',             label: 'Manutenção' },
                { value: 'fas fa-heartbeat',         label: 'Saúde' },
            ];

            const iconSelectHtml = `<select class="store-info-icon-select">
                ${STORE_INFO_ICONS.map(i => `<option value="${i.value}">${i.label}</option>`).join('')}
            </select>`;

            const renderStoreInfoItem = (item = {}) => {
                const el = document.createElement('div');
                el.className = 'store-info-item-row';
                el.innerHTML = `
                    ${iconSelectHtml}
                    <input type="text" class="store-info-label-input" placeholder="Rótulo (ex: Horário)" maxlength="40" value="${(item.label || '').replace(/"/g, '&quot;')}">
                    <input type="text" class="store-info-value-input" placeholder="Valor (ex: Seg-Sex 8h-18h)" maxlength="80" value="${(item.value || '').replace(/"/g, '&quot;')}">
                    <button type="button" class="store-info-remove-btn" title="Remover"><i class="fas fa-trash"></i></button>
                `;
                el.querySelector('.store-info-icon-select').value = item.icon || 'fas fa-info-circle';
                el.querySelector('.store-info-remove-btn').addEventListener('click', () => el.remove());
                return el;
            };

            const storeInfoList = document.getElementById('store-info-list');
            storeInfoList.innerHTML = '';
            let currentInfoItems = [];
            try {
                const raw = profile.store_info;
                if (Array.isArray(raw)) currentInfoItems = raw;
                else if (typeof raw === 'string' && raw.trim()) currentInfoItems = JSON.parse(raw);
            } catch (_) { currentInfoItems = []; }
            currentInfoItems.forEach(item => storeInfoList.appendChild(renderStoreInfoItem(item)));

            document.getElementById('btn-add-store-info').onclick = () => {
                storeInfoList.appendChild(renderStoreInfoItem());
            };
            // =================================================================

            // ========== NOVO: Campos hidden para latitude/longitude ==========
            // Verifica se já existem, se não, cria e insere no formulário
            let latField = document.getElementById('edit-business-latitude');
            let lngField = document.getElementById('edit-business-longitude');
            
            if (!latField) {
                latField = document.createElement('input');
                latField.type = 'hidden';
                latField.id = 'edit-business-latitude';
                latField.name = 'latitude';
                document.getElementById('edit-profile-form').appendChild(latField);
            }
            if (!lngField) {
                lngField = document.createElement('input');
                lngField.type = 'hidden';
                lngField.id = 'edit-business-longitude';
                lngField.name = 'longitude';
                document.getElementById('edit-profile-form').appendChild(lngField);
            }
            
            // Preenche com os valores atuais (se houver)
            latField.value = profile.latitude || '';
            lngField.value = profile.longitude || '';
            // =================================================================
            
        } else {
            merchantFields.classList.add('hidden');
        }
    },

    /**
     * Renderiza visualizador de story
     */
    renderStoryViewer(story) {
        this.renderStorySequence([story]);
    },

    /**
     * Atualiza contador de curtidas na UI
     */
    updateLikeCount(promoId, count, isLiked) {
        const card = document.querySelector(`[data-id="${promoId}"]`);
        if (!card) return;

        const btn = card.querySelector('.action-group .action-btn:first-child');
        if (!btn) return;
        const icon = btn.querySelector('i');
        const span = btn.querySelector('span');

        btn.classList.toggle('active', isLiked);
        icon.className = isLiked ? 'fas fa-fire fire-on' : 'fas fa-fire fire-off';
        span.textContent = count;
    },

    /**
     * Atualiza estado de favorito na UI
     */
    updateFavoriteState(promoId, isFavorited) {
        const card = document.querySelector(`[data-id="${promoId}"]`);
        if (!card) return;

        const btn = card.querySelector('.action-btn-favorite');
        if (!btn) return;
        const icon = btn.querySelector('i');
        if (!icon) return;

        btn.classList.toggle('active', isFavorited);
        icon.className = isFavorited ? 'fas fa-bookmark' : 'far fa-bookmark';
    },

    // ==================== FUNÇÕES PARA O MAPA ====================

    /**
     * Renderiza a lista de promoções no mapa
     */
    renderMapPromoList(promotions) {
        const container = this.elements.mapList;
        if (!container) return;

        if (!promotions || promotions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-map-marked-alt"></i>
                    <p>Nenhuma promoção com localização encontrada</p>
                </div>
            `;
            return;
        }

        let html = '<h3>Promoções próximas</h3>';
        
        promotions.forEach(promo => {
            const imageUrl = promo.image_url || '';
            const storeName = promo.author?.business_name || promo.author?.name || 'Comerciante';
            const price = utils.formatCurrency(promo.new_price);
            
            html += `
                <div class="map-promo-item" data-promo-id="${promo.id}" onclick="app.openPromoFromMap('${promo.id}')">
                    <img src="${imageUrl}" 
                         alt="${promo.title}" 
                         class="map-promo-image" 
                         onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'70\' height=\'70\' viewBox=\'0 0 70 70\'%3E%3Crect width=\'70\' height=\'70\' fill=\'%23cccccc\'/%3E%3Ctext x=\'35\' y=\'35\' text-anchor=\'middle\' dy=\'.3em\' fill=\'%23999\' font-size=\'12\' font-family=\'Arial\'%3E📷%3C/text%3E%3C/svg%3E'">
                    <div class="map-promo-info">
                        <h4>${promo.title}</h4>
                        <div class="map-promo-store">${storeName}</div>
                        <div class="map-promo-price">${price}</div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    // ==================== ENTREGAS ====================

    renderDeliveryRequestScreen(promo, merchant) {
        const summaryEl = document.getElementById('delivery-request-promo-summary');
        const feeEl = document.getElementById('delivery-fee-summary');
        if (!summaryEl || !feeEl) return;

        // Limpa campos do pedido anterior
        const addressInput = document.getElementById('delivery-address');
        const notesInput = document.getElementById('delivery-notes');
        const changeForInput = document.getElementById('delivery-change-for');
        const trocoGroup = document.getElementById('troco-group');
        if (addressInput) addressInput.value = '';
        if (notesInput) notesInput.value = '';
        if (changeForInput) changeForInput.value = '';
        if (trocoGroup) trocoGroup.classList.add('hidden');
        document.querySelectorAll('input[name="payment_method"]').forEach(r => r.checked = false);

        // Reseta a seção de localização ao abrir nova tela
        document.getElementById('gps-location-preview')?.classList.add('hidden');
        document.getElementById('manual-address-input')?.classList.add('hidden');
        const gpsAddrSpan = document.getElementById('gps-preview-address');
        const gpsLink = document.getElementById('gps-preview-link');
        if (gpsAddrSpan) gpsAddrSpan.textContent = 'Obtendo endereço...';
        if (gpsLink) gpsLink.href = '#';

        const price = utils.formatCurrency(promo.new_price);
        summaryEl.innerHTML = `
            <div class="delivery-promo-summary">
                <img src="${promo.image_url || ''}" alt="${promo.title}" onerror="this.style.display='none'">
                <div>
                    <strong>${promo.title}</strong>
                    <p>${price}</p>
                </div>
            </div>
        `;
        feeEl.innerHTML = '<p class="delivery-fee-note">Preencha o endereço para ver a taxa de entrega.</p>';
        const phoneInput = document.getElementById('delivery-client-phone');
        const nameInput = document.getElementById('delivery-client-name');
        if (auth.currentUser && auth.currentUser.profile) {
            if (nameInput) nameInput.value = auth.currentUser.profile.name || '';
            if (phoneInput) phoneInput.value = auth.currentUser.profile.phone || '';
        }
    },

    renderMerchantOtherPromos(promos, currentItems) {
        const section = document.getElementById('merchant-other-promos-section');
        const el = document.getElementById('merchant-other-promos-list');
        if (!section || !el) return;
        if (!promos || promos.length === 0) {
            section.classList.add('hidden');
            return;
        }
        section.classList.remove('hidden');
        // IDs já adicionados (exceto item principal). Formato: "promotion:123" / "highlight:uuid"
        const addedIds = new Set(
            currentItems
                .filter(i => !i.isMain)
                .map(i => String(i.extraKey || i.promoId))
        );
        el.innerHTML = promos.map(p => {
            const sourceType = p.extraType === 'highlight' ? 'highlight' : 'promotion';
            const itemKey = `${sourceType}:${p.id}`;
            const inCart = addedIds.has(itemKey);
            const qty = currentItems.find(i => String(i.extraKey || i.promoId) === itemKey)?.qty || 0;
            const priceNum = parseFloat(p.new_price);
            const canAdd = p.canAdd !== false && Number.isFinite(priceNum) && priceNum > 0;
            const promoJson = JSON.stringify(p).replace(/"/g, '&quot;');
            const keyEsc = itemKey.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const imgHtml = p.image_url
                ? `<img src="${p.image_url}" alt="${utils.sanitizeInput(p.title)}" onerror="this.style.display='none'">`
                : `<div class="other-promo-no-img"><i class="fas fa-${sourceType === 'highlight' ? 'star' : 'tag'}"></i></div>`;
            const addControl = !canAdd
                ? `<span class="other-promo-disabled">Sob consulta</span>`
                : inCart
                ? `<div class="other-promo-qty-ctrl">
                       <button type="button" class="other-qty-btn minus" onclick="event.stopPropagation(); app.removeOneExtraDeliveryItem('${keyEsc}')">
                           <i class="fas fa-minus"></i>
                       </button>
                       <span class="other-promo-qty-val">${qty}</span>
                       <button type="button" class="other-qty-btn plus" onclick="event.stopPropagation(); app.addExtraDeliveryItem(${promoJson})">
                           <i class="fas fa-plus"></i>
                       </button>
                   </div>`
                : `<span class="other-promo-plus"><i class="fas fa-plus"></i></span>`;
            const badge = sourceType === 'highlight'
                ? '<span class="other-promo-badge">Destaque</span>'
                : '';
            return `
                <div class="other-promo-card ${inCart ? 'in-cart' : ''} ${!canAdd ? 'disabled' : ''}" ${canAdd ? `onclick="app.addExtraDeliveryItem(${promoJson})"` : ''}>
                    <div class="other-promo-img">${imgHtml}</div>
                    <div class="other-promo-info">
                        ${badge}
                        <span class="other-promo-name">${utils.sanitizeInput(p.title)}</span>
                        <div class="other-promo-bottom">
                            <span class="other-promo-price ${!canAdd ? 'muted' : ''}">${canAdd ? utils.formatCurrency(priceNum) : 'Sob consulta'}</span>
                            <div class="other-promo-add">${addControl}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    renderOrderItemsList(items, onRemove) {
        const el = document.getElementById('order-items-list');
        if (!el) return;
        el.innerHTML = items.map((item, idx) => {
            const lineTotal = utils.formatCurrency(item.qty * item.unitPrice);
            const qtyControls = item.isMain
                ? `<div class="item-qty-ctrl">
                       <button type="button" class="qty-btn" onclick="app.updateMainItemQty(${item.qty - 1})"><i class="fas fa-minus"></i></button>
                       <span class="qty-val">${item.qty}</span>
                       <button type="button" class="qty-btn" onclick="app.updateMainItemQty(${item.qty + 1})"><i class="fas fa-plus"></i></button>
                   </div>`
                : `<button type="button" class="item-remove-btn" onclick="app.removeDeliveryItem(${idx})"><i class="fas fa-trash"></i></button>`;
            return `
                <div class="order-item-row ${item.isMain ? 'main-item' : ''}">
                    <div class="order-item-info">
                        <span class="order-item-name">${utils.sanitizeInput(item.name)}</span>
                        <span class="order-item-price">${utils.formatCurrency(item.unitPrice)} un. · <strong>${lineTotal}</strong></span>
                    </div>
                    ${qtyControls}
                </div>
            `;
        }).join('');
    },

    updateDeliveryFeeSummary(promoTotal, deliveryFee, total, km) {
        const feeEl = document.getElementById('delivery-fee-summary');
        if (!feeEl) return;
        const distLabel = (km != null && km > 0)
            ? `<span class="delivery-distance-label">${km.toFixed(1)} km</span>`
            : '';
        feeEl.innerHTML = `
            <div class="delivery-fee-line"><span>Produto</span><span>${utils.formatCurrency(promoTotal)}</span></div>
            <div class="delivery-fee-line"><span>Taxa de entrega ${distLabel}</span><span>${utils.formatCurrency(deliveryFee)}</span></div>
            <div class="delivery-fee-line total"><span>Total</span><span>${utils.formatCurrency(total)}</span></div>
        `;
    },

    // ==================== NOTIFICAÇÕES ====================

    updateNotificationsBadge(unreadCount) {
        if (!this.elements.notificationsBadge) return;
        const count = Number(unreadCount || 0);
        this.elements.notificationsBadge.textContent = String(count);
        this.elements.notificationsBadge.classList.toggle('hidden', count <= 0);
    },

    openNotificationsModal() {
        document.getElementById('notifications-modal')?.classList.remove('hidden');
    },

    closeNotificationsModal() {
        document.getElementById('notifications-modal')?.classList.add('hidden');
    },

    /** Remove o destaque azul (não lida) do item da notificação no DOM. */
    markNotificationAsReadInList(notificationId) {
        const item = document.querySelector(`.notification-item[data-notification-id="${notificationId}"]`);
        if (!item) return;
        item.classList.remove('unread');
        const statusSpan = item.querySelector('.notification-read-status');
        if (statusSpan) statusSpan.textContent = 'Lida';
    },

    renderNotifications(list) {
        const el = document.getElementById('notifications-list');
        if (!el) return;
        if (!list || list.length === 0) {
            el.innerHTML = '<div class="empty-state"><i class="fas fa-bell"></i><p>Nenhuma notificação</p></div>';
            return;
        }
        el.innerHTML = list.map(n => {
            const created = n.created_at ? utils.formatDate(n.created_at) : '';
            const unreadClass = n.is_read ? '' : 'unread';
            const actionUrl = n.action_url || '';
            const escapedUrl = actionUrl.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const action = actionUrl ? `
                <div class="notification-action">
                    <button type="button" class="notif-action-btn" onclick="event.stopPropagation(); app.openNotificationAction('${n.id}', '${escapedUrl}')">
                        <i class="fas fa-arrow-right"></i> ${utils.sanitizeInput(n.action_label || 'Abrir')}
                    </button>
                </div>
            ` : '';
            return `
                <div class="notification-item ${unreadClass}" data-notification-id="${n.id}" onclick="app.openNotificationAction('${n.id}', '${escapedUrl}')">
                    <div class="notif-icon-col">
                        <span class="notif-icon-circle ${unreadClass}"><i class="fas fa-bell"></i></span>
                    </div>
                    <div class="notif-content-col">
                        <div class="notification-title">${utils.sanitizeInput(n.title || '')}</div>
                        <div class="notification-message">${utils.sanitizeInput(n.message || '')}</div>
                        <div class="notification-meta">
                            <span class="notif-time-label">${created}</span>
                            <span class="notification-read-status ${n.is_read ? 'notif-read' : 'notif-unread-tag'}">${n.is_read ? '' : 'Nova'}</span>
                        </div>
                        ${action}
                    </div>
                </div>
            `;
        }).join('');
    },

    renderMotoboyAvailable(list) {
        const el = document.getElementById('motoboy-available-list');
        if (!el) return;
        if (!list || list.length === 0) {
            el.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Nenhuma entrega disponível</p></div>';
            return;
        }
        el.innerHTML = list.map(d => {
            const merchant = d.merchant || {};
            const pickupLat = d.pickup_lat;
            const pickupLng = d.pickup_lng;
            const deliveryLat = d.delivery_lat;
            const deliveryLng = d.delivery_lng;
            const km = (pickupLat && pickupLng && deliveryLat && deliveryLng)
                ? utils.getDistanceKm(pickupLat, pickupLng, deliveryLat, deliveryLng)
                : null;
            const distHtml = km != null
                ? `<p><i class="fas fa-road"></i> Distância estimada: <strong>${km.toFixed(1)} km</strong></p>`
                : '';
            return `
                <div class="delivery-card available" data-delivery-id="${d.id}">
                    <h4>${d.promotion?.title || 'Promoção'}</h4>
                    <p><i class="fas fa-store"></i> ${merchant.business_name || merchant.name || ''}</p>
                    <p><i class="fas fa-map-marker-alt"></i> Retirada: ${this.formatPickupAddress(d.pickup_address || merchant.business_address, d.pickup_lat || merchant.latitude, d.pickup_lng || merchant.longitude)}</p>
                    <p><i class="fas fa-map-pin"></i> Entrega: ${this.formatDeliveryAddress(d.delivery_address)}</p>
                    ${distHtml}
                    <p class="delivery-fee"><i class="fas fa-tag"></i> Taxa de entrega: <strong>${utils.formatCurrency(parseFloat(d.delivery_fee || 0))}</strong></p>
                    <button type="button" class="btn btn-primary btn-block" onclick="app.acceptDeliveryAsMotoboy('${d.id}')">
                        <i class="fas fa-motorcycle"></i> Aceitar entrega
                    </button>
                </div>
            `;
        }).join('');
    },

    renderMotoboyInProgress(list) {
        const el = document.getElementById('motoboy-in-progress-list');
        if (!el) return;
        if (!list || list.length === 0) {
            el.innerHTML = '<div class="empty-state"><i class="fas fa-box-open"></i><p>Nenhuma entrega em andamento</p></div>';
            return;
        }
        el.innerHTML = list.map(d => {
            const statusLabel = { waiting_motoboy: 'Aceita', picked_up: 'Pegou', in_delivery: 'A caminho' }[d.status] || d.status;
            return `
                <div class="delivery-card in-progress" data-delivery-id="${d.id}">
                    <h4>${d.promotion?.title || 'Promoção'}</h4>
                    <p><strong>Status:</strong> ${statusLabel}</p>
                    <p>${this.formatDeliveryAddress(d.delivery_address)}</p>
                    <button type="button" class="btn btn-primary btn-block" onclick="app.openDeliveryDetail('${d.id}')">Ver detalhes</button>
                </div>
            `;
        }).join('');
    },

    renderMotoboyHistory(list) {
        const el = document.getElementById('motoboy-history-list');
        if (!el) return;
        if (!list || list.length === 0) {
            el.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><p>Nenhuma entrega realizada</p></div>';
            return;
        }
        el.innerHTML = list.map(d => {
            return `
                <div class="delivery-card history">
                    <h4>${d.promotion?.title || 'Promoção'}</h4>
                    <p>${utils.formatRelativeTime(d.updated_at)} · ${utils.formatCurrency(parseFloat(d.delivery_fee))}</p>
                </div>
            `;
        }).join('');
    },

    renderMyDeliveries(list) {
        const el = document.getElementById('my-deliveries-list');
        if (!el) return;
        if (!list || list.length === 0) {
            el.innerHTML = '<div class="empty-state"><i class="fas fa-box"></i><p>Nenhum pedido com entrega</p></div>';
            return;
        }
        const statusLabels = {
            pending_merchant: 'Aguardando comerciante',
            accepted_merchant: 'Aguardando motoboy',
            rejected_merchant: 'Recusado',
            picked_up: 'Motoboy pegou',
            in_delivery: 'A caminho',
            delivered: 'Entregue',
            cancelled: 'Cancelado'
        };
        el.innerHTML = list.map(d => {
            const status = statusLabels[d.status] || d.status;
            const canTrack = ['picked_up', 'in_delivery'].includes(d.status);

            // Extrai bloco de itens do campo notes se existir
            const notes = d.notes || '';
            const itemsMatch = notes.match(/--- Itens do pedido ---\n([\s\S]*?)\n-----------------------/);
            let itemsHtml = '';
            if (itemsMatch) {
                const lines = itemsMatch[1].split('\n').filter(Boolean);
                itemsHtml = `<div class="client-order-items">${lines.map(l => `<span>${utils.sanitizeInput(l)}</span>`).join('')}</div>`;
            }

            return `
                <div class="merchant-order-card" data-delivery-id="${d.id}">
                    <div class="merchant-order-header">
                        <strong>${d.promotion?.title || 'Promoção'}</strong>
                        <span class="order-status ${d.status}">${status}</span>
                    </div>
                    <p><i class="fas fa-store"></i> ${d.merchant?.business_name || d.merchant?.name || 'Comerciante'}</p>
                    ${itemsHtml}
                    <p><i class="fas fa-tag"></i> Total: <strong>${utils.formatCurrency(parseFloat(d.total))}</strong></p>
                    ${canTrack ? `<button type="button" class="btn btn-primary btn-block" onclick="app.openDeliveryTracking('${d.id}')">Acompanhar entrega</button>` : ''}
                </div>
            `;
        }).join('');
    },

    renderMerchantOrders(list) {
        const el = document.getElementById('merchant-orders-list');
        if (!el) return;
        if (!list || list.length === 0) {
            el.innerHTML = '<div class="empty-state"><i class="fas fa-shopping-bag"></i><p>Nenhum pedido de entrega</p></div>';
            return;
        }
        const statusLabels = {
            pending_merchant: 'Aguardando sua resposta',
            accepted_merchant: 'Aguardando motoboy',
            rejected_merchant: 'Recusado',
            picked_up: 'Motoboy pegou',
            in_delivery: 'A caminho',
            delivered: 'Entregue',
            cancelled: 'Cancelado'
        };
        const paymentLabels = { dinheiro: 'Dinheiro', cartao: 'Cartão', pix: 'Pix' };
        const paymentIcons  = { dinheiro: 'fa-money-bill-wave', cartao: 'fa-credit-card', pix: 'fa-qrcode' };

        el.innerHTML = list.map(d => {
            const status = statusLabels[d.status] || d.status;
            const canRespond = d.status === 'pending_merchant';

            // Tenta ler payment_method da coluna; se null, extrai do campo notes (fallback)
            let pmKey = d.payment_method || null;
            let changeFor = d.change_for ? parseFloat(d.change_for) : null;
            let notesClean = d.notes || '';
            if (!pmKey && notesClean) {
                const match = notesClean.match(/^\[Pagamento:\s*(Dinheiro|Cartão|Pix)(?:\s*\(troco p\/ R\$([\d.]+)\))?\]\s*/i);
                if (match) {
                    const labelMap = { 'dinheiro': 'dinheiro', 'cartão': 'cartao', 'pix': 'pix' };
                    pmKey = labelMap[match[1].toLowerCase()] || null;
                    if (match[2]) changeFor = parseFloat(match[2]);
                    notesClean = notesClean.replace(match[0], '').trim();
                }
            }

            const pmLabel = pmKey ? (paymentLabels[pmKey] || pmKey) : null;
            const pmIcon  = pmKey ? (paymentIcons[pmKey]  || 'fa-wallet') : null;
            const trocoHtml = (pmKey === 'dinheiro' && changeFor)
                ? `<span class="troco-info"> · Troco para ${utils.formatCurrency(changeFor)}</span>`
                : '';
            const paymentHtml = pmLabel
                ? `<p><span class="payment-method-badge ${pmKey}"><i class="fas ${pmIcon}"></i> ${pmLabel}</span>${trocoHtml}</p>`
                : `<p><span class="payment-method-badge" style="background:#f3f4f6;color:#6b7280;border-color:#e5e7eb"><i class="fas fa-wallet"></i> Pagamento não informado</span></p>`;

            // WhatsApp do cliente
            const clientPhone = (d.client?.phone || d.client_phone || '').replace(/\D/g, '');
            const clientName  = d.client?.name || d.client_name || 'Cliente';
            const promoTitle  = d.promotion?.title || 'promoção';
            const waText = encodeURIComponent(
                `Olá ${clientName}! Vi seu pedido de "${promoTitle}" no PROMOCITY. Podemos combinar os detalhes da entrega?`
            );
            const waHtml = clientPhone
                ? `<a href="https://wa.me/55${clientPhone}?text=${waText}" target="_blank" class="btn btn-whatsapp btn-block">
                       <i class="fab fa-whatsapp"></i> Falar com o cliente
                   </a>`
                : '';

            // Observações limpas (sem o prefixo de pagamento)
            const notesHtml = notesClean
                ? `<p class="order-notes"><i class="fas fa-comment-dots"></i> ${notesClean}</p>`
                : '';

            return `
                <div class="merchant-order-card" data-delivery-id="${d.id}">
                    <div class="merchant-order-header">
                        <strong>${promoTitle}</strong>
                        <span class="order-status ${d.status}">${status}</span>
                    </div>
                    <p><i class="fas fa-user"></i> <strong>${clientName}</strong> · ${clientPhone ? `(${d.client?.phone || d.client_phone})` : 'sem telefone'}</p>
                    <p><i class="fas fa-map-pin"></i> ${this.formatDeliveryAddress(d.delivery_address)}</p>
                    <p><i class="fas fa-tag"></i> Total: <strong>${utils.formatCurrency(parseFloat(d.total))}</strong></p>
                    ${paymentHtml}
                    ${notesHtml}
                    ${waHtml}
                    ${canRespond ? `
                        <div class="merchant-order-actions">
                            <button type="button" class="btn btn-primary" onclick="app.merchantAcceptDelivery('${d.id}')">Aceitar</button>
                            <button type="button" class="btn btn-secondary" onclick="app.merchantRejectDelivery('${d.id}')">Recusar</button>
                        </div>
                    ` : ''}
                    ${['picked_up', 'in_delivery'].includes(d.status) ? `
                        <button type="button" class="btn btn-secondary btn-block" onclick="app.openDeliveryTracking('${d.id}')">Acompanhar entrega</button>
                    ` : ''}
                </div>
            `;
        }).join('');
    },

    renderDeliveryTracking(delivery, locations) {
        const statusEl = document.getElementById('delivery-tracking-status');
        const detailsEl = document.getElementById('delivery-tracking-details');
        if (!statusEl || !detailsEl) return;
        const statusLabels = { picked_up: 'Pegou o pedido', in_delivery: 'A caminho', delivered: 'Entregue' };
        statusEl.innerHTML = `<p class="tracking-status">${statusLabels[delivery.status] || delivery.status}</p>`;
        detailsEl.innerHTML = `
            <p><strong>Retirada:</strong> ${this.formatPickupAddress(delivery.pickup_address, delivery.pickup_lat, delivery.pickup_lng)}</p>
            <p><strong>Entrega:</strong> ${this.formatDeliveryAddress(delivery.delivery_address)}</p>
        `;
    },

    renderDeliveryDetail(delivery) {
        const contentEl = document.getElementById('delivery-detail-content');
        const actionsEl = document.getElementById('delivery-detail-actions');
        if (!contentEl || !actionsEl) return;
        const promo = delivery.promotion || {};
        const client = delivery.client || {};
        const merchant = delivery.merchant || {};
        const paymentLabels = { dinheiro: 'Dinheiro', cartao: 'Cartão na entrega', pix: 'Pix na entrega' };
        const paymentIcons  = { dinheiro: 'fa-money-bill-wave', cartao: 'fa-credit-card', pix: 'fa-qrcode' };

        // Lê payment_method direto; se nulo, extrai do campo notes como fallback
        let pmKey = delivery.payment_method || null;
        let changeFor = delivery.change_for || null;
        if (!pmKey && delivery.notes) {
            const pmMatch = delivery.notes.match(/\[Pagamento:\s*(Dinheiro|Cart[aã]o|Pix)/i);
            if (pmMatch) {
                const raw = pmMatch[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                pmKey = raw === 'cartao' ? 'cartao' : raw === 'pix' ? 'pix' : 'dinheiro';
            }
            if (!changeFor && pmKey === 'dinheiro') {
                const trocoMatch = delivery.notes.match(/troco p\/ R\$(\d+[.,]\d{2})/i);
                if (trocoMatch) changeFor = parseFloat(trocoMatch[1].replace(',', '.'));
            }
        }

        const pmLabel = pmKey ? (paymentLabels[pmKey] || pmKey) : 'Não informado';
        const pmIcon  = pmKey ? (paymentIcons[pmKey]  || 'fa-wallet') : 'fa-wallet';
        const trocoHtml = (pmKey === 'dinheiro' && changeFor)
            ? `<br><small class="troco-info">Troco para ${utils.formatCurrency(parseFloat(changeFor))}</small>`
            : '';
        const pickupLat = delivery.pickup_lat || merchant.latitude || null;
        const pickupLng = delivery.pickup_lng || merchant.longitude || null;
        const pickupAddr = merchant.business_address || delivery.pickup_address || null;

        contentEl.innerHTML = `
            <div class="delivery-detail-card">
                <h4>${promo.title || 'Promoção'}</h4>
                <p><i class="fas fa-store"></i> Retirar em: ${this.formatPickupAddress(pickupAddr, pickupLat, pickupLng)}</p>
                <p><i class="fas fa-map-pin"></i> Entregar em: ${this.formatDeliveryAddress(delivery.delivery_address)}</p>
                <p><i class="fas fa-user"></i> ${client.name || ''} · ${client.phone || ''}</p>
                <p><i class="fas ${pmIcon}"></i> Pagamento: <span class="payment-method-badge ${pmKey || ''}">${pmLabel}</span>${trocoHtml}</p>
            </div>
        `;
        const nextStatus = { waiting_motoboy: 'picked_up', picked_up: 'in_delivery', in_delivery: 'delivered' }[delivery.status];
        let actionsHtml = '';
        if (delivery.status === 'waiting_motoboy') {
            actionsHtml += '<button type="button" class="btn btn-primary btn-block" onclick="app.updateDeliveryStatusAndRefresh(\'picked_up\')"><i class="fas fa-box"></i> Sai para entrega</button>';
        }
        if (delivery.status === 'picked_up') {
            actionsHtml += '<button type="button" class="btn btn-primary btn-block" onclick="app.updateDeliveryStatusAndRefresh(\'in_delivery\')"><i class="fas fa-motorcycle"></i> A caminho do cliente</button>';
        }
        if (delivery.status === 'in_delivery') {
            actionsHtml += '<button type="button" class="btn btn-primary btn-block" onclick="app.updateDeliveryStatusAndRefresh(\'delivered\')"><i class="fas fa-check"></i> Marcar como entregue</button>';
        }
        if (['picked_up', 'in_delivery'].includes(delivery.status)) {
            actionsHtml += '<button type="button" class="btn btn-secondary btn-block" id="btn-share-location"><i class="fas fa-location-crosshairs"></i> Compartilhar localização</button>';
        }
        actionsEl.innerHTML = actionsHtml;
    },

    // =====================================================================
    // LOJA VISUAL DO COMERCIANTE — grid de produtos + carrinho local
    // =====================================================================

    _cart: { merchantId: null, merchantPhone: null, items: [] },

    _buildStoreGrid(profile, options = {}) {
        const ownerView = options.ownerView === true;
        const promos = profile.promotions || [];
        const highlights = profile.store_highlights || [];
        const ph = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23e5e7eb'/%3E%3C/svg%3E";

        const promoTitle = ownerView ? 'Suas promoções na vitrine' : 'Promoções no feed';
        const promoSub = ownerView
            ? '<p class="store-section-sub">As mesmas do feed — ao expirar lá, somem daqui.</p>'
            : '<p class="store-section-sub">Ofertas com validade no feed.</p>';

        const promoInner = promos.length > 0
            ? promos.map(p => this._createPromoRailCard(p, ph, ownerView)).join('')
            : `<div class="store-rail-empty"><i class="fas fa-tag"></i>${ownerView ? ' Nenhuma promoção ativa.' : ' Nenhuma promoção ativa no momento.'}</div>`;

        const highlightsBlock = this._buildHighlightsSection(highlights, ph, ownerView);

        const wrapClass = ownerView ? 'store-storefront store-storefront-owner' : 'store-storefront store-storefront-with-cart';
        let out = `
            <div class="${wrapClass}">
                <div class="store-block store-block-promos">
                    <p class="store-section-title"><i class="fas fa-bolt"></i> ${promoTitle}</p>
                    ${promoSub}
                    <div class="store-rail-scroll">
                        <div class="store-rail-track">${promoInner}</div>
                    </div>
                </div>
                ${highlightsBlock}
            </div>
        `;
        if (ownerView) return out;
        return out + `
            <button type="button" class="cart-fab hidden" id="store-cart-fab" onclick="ui._openCart()" aria-label="Ver carrinho">
                <i class="fas fa-shopping-cart" style="font-size:1.25rem"></i>
                <span class="cart-fab-count" id="store-cart-count">0</span>
            </button>
            <div class="cart-modal hidden" id="store-cart-modal">
                <div class="cart-overlay" onclick="ui._closeCart()"></div>
                <div class="cart-drawer">
                    <div class="cart-drawer-header">
                        <h3><i class="fas fa-shopping-cart"></i> Carrinho</h3>
                        <button type="button" onclick="ui._closeCart()"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="cart-items-list" id="store-cart-items"></div>
                    <div class="cart-footer">
                        <div class="cart-total-row">
                            <span>Total</span>
                            <span class="cart-total-value" id="store-cart-total">R$ 0,00</span>
                        </div>
                        <button type="button" class="btn btn-primary btn-block" onclick="ui._sendCartWhatsApp()">
                            <i class="fab fa-whatsapp"></i> Pedir via WhatsApp
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    _buildHighlightsSection(highlights, ph, ownerView) {
        const sub = ownerView
            ? '<p class="store-section-sub">Ficam no perfil sem prazo de validade — edite ou exclua pelo card.</p>'
            : '<p class="store-section-sub">Seleção fixa da loja.</p>';
        const addBtn = ownerView
            ? `<button type="button" class="btn btn-secondary store-highlight-add-btn" onclick="app.openHighlightEditor(null)"><i class="fas fa-plus"></i> Adicionar destaque</button>`
            : '';

        const inner = highlights.length > 0
            ? highlights.map(h => this._createHighlightRailCard(h, ph, ownerView)).join('')
            : `<div class="store-rail-empty"><i class="fas fa-star"></i>${ownerView ? ' Nenhum destaque. Toque em "Adicionar destaque".' : ' Nenhum destaque cadastrado.'}</div>`;

        return `
            <div class="store-block store-block-highlights">
                <div class="store-block-highlights-head">
                    <p class="store-section-title store-section-title-inline"><i class="fas fa-star"></i> Destaques da loja</p>
                    ${addBtn}
                </div>
                ${sub}
                <div class="store-rail-scroll">
                    <div class="store-rail-track">${inner}</div>
                </div>
            </div>
        `;
    },

    _createHighlightRailCard(h, ph, ownerView = false) {
        const hid = String(h.id || '').replace(/'/g, "\\'");
        const titleEsc = (h.title || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const imgEsc = (h.image_url || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const priceNum = h.price != null && h.price !== '' ? parseFloat(h.price) : 0;
        const priceLabel = h.price != null && h.price !== '' ? utils.formatCurrency(h.price) : 'Sob consulta';
        const ownerBar = ownerView
            ? `<div class="highlight-owner-actions">
                    <button type="button" class="highlight-icon-btn" onclick="app.openHighlightEditor('${hid}')" title="Editar"><i class="fas fa-pen"></i></button>
                    <button type="button" class="highlight-icon-btn highlight-icon-btn-danger" onclick="app.deleteStoreHighlight('${hid}')" title="Excluir"><i class="fas fa-trash"></i></button>
               </div>`
            : '';
        const actionBtn = ownerView
            ? ''
            : `<button type="button" class="rail-card-btn" onclick="ui._addToCart('${hid}','${titleEsc}',${priceNum},'${imgEsc}')"><i class="fas fa-plus"></i> Carrinho</button>`;
        return `
            <article class="rail-card highlight-rail-card" data-highlight-id="${h.id}">
                ${ownerBar}
                <div class="rail-card-img-wrap">
                    <img src="${h.image_url || ph}" alt="${h.title || ''}" loading="lazy" onerror="this.src='${ph}'">
                </div>
                <div class="rail-card-body">
                    <h4 class="rail-card-title">${h.title || ''}</h4>
                    <div class="rail-card-prices"><span class="rail-card-price">${priceLabel}</span></div>
                </div>
                ${actionBtn}
            </article>
        `;
    },

    _createPromoRailCard(promo, ph, ownerView = false) {
        const price = utils.formatCurrency(promo.new_price);
        const oldPrice = promo.old_price ? utils.formatCurrency(promo.old_price) : null;
        const titleEsc = (promo.title || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const imgEsc = (promo.image_url || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const idStr = String(promo.id || '').replace(/'/g, "\\'");
        const actionBtn = ownerView
            ? `<button type="button" class="rail-card-btn rail-card-btn-owner" onclick="app.editPromo('${idStr}')"><i class="fas fa-pen"></i> Editar</button>`
            : `<button type="button" class="rail-card-btn" onclick="ui._addToCart('${promo.id}','${titleEsc}',${promo.new_price || 0},'${imgEsc}')"><i class="fas fa-plus"></i> Carrinho</button>`;
        return `
            <article class="rail-card promo-rail-card" data-id="${promo.id}">
                <div class="rail-card-img-wrap">
                    <img src="${promo.image_url || ph}" alt="${promo.title || ''}" loading="lazy" onerror="this.src='${ph}'">
                    ${promo.is_hot ? '<span class="product-badge-hot">HOT</span>' : ''}
                </div>
                <div class="rail-card-body">
                    <h4 class="rail-card-title">${promo.title || ''}</h4>
                    <div class="rail-card-prices">
                        <span class="rail-card-price">${price}</span>
                        ${oldPrice ? `<span class="rail-card-old">${oldPrice}</span>` : ''}
                    </div>
                </div>
                ${actionBtn}
            </article>
        `;
    },

    // ── Countdown manager ─────────────────────────────────────────────────────
    // _tickCountdown() é chamado imediatamente após renderFeed E a cada segundo
    // pelo setInterval, garantindo que o countdown apareça sem delay visível.
    _countdownTimer: null,

    _tickCountdown() {
        const badges = document.querySelectorAll('.promo-badge.hot[data-expires-at]');
        if (!badges.length) return;
        badges.forEach(badge => {
            const expiresAt = badge.dataset.expiresAt;
            if (!expiresAt) return;
            const remaining = utils.getRemainingTime(expiresAt);
            if (remaining <= 0) {
                badge.style.display = 'none';
                return;
            }
            const countdownEl = badge.querySelector('.hot-countdown');
            if (countdownEl) {
                countdownEl.textContent = utils.formatCountdown(remaining);
            }
            const countdownWrap = badge.querySelector('.hot-countdown-wrap');
            if (countdownWrap) {
                countdownWrap.classList.toggle('hot-countdown--urgent', remaining > 0 && remaining < 3600);
            }
        });
    },

    startCountdownManager() {
        // Dispara imediatamente para preencher o countdown sem aguardar 1 s
        this._tickCountdown();
        if (this._countdownTimer) return;
        this._countdownTimer = setInterval(() => this._tickCountdown(), 1000);
    },

    stopCountdownManager() {
        if (this._countdownTimer) {
            clearInterval(this._countdownTimer);
            this._countdownTimer = null;
        }
    },
    // ─────────────────────────────────────────────────────────────────────────

    toggleMerchantProfileDetails() {
        const el = document.getElementById('merchant-profile-details');
        if (!el) return;
        el.classList.toggle('hidden');
        const hidden = el.classList.contains('hidden');
        el.setAttribute('aria-hidden', hidden ? 'true' : 'false');
        if (!hidden) {
            try {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } catch (_) {
                el.scrollIntoView();
            }
        }
    },

    _initCart(merchantId, phone) {
        this._cart = {
            merchantId,
            merchantPhone: utils.normalizeWhatsAppNumber(phone || ''),
            items: []
        };
        this._updateCartFAB();
    },

    _addToCart(id, title, price, image) {
        const existing = this._cart.items.find(i => i.id === id);
        if (existing) {
            existing.qty += 1;
        } else {
            this._cart.items.push({ id, title, price: parseFloat(price) || 0, qty: 1, image });
        }
        this._updateCartFAB();
        this._renderCartItems();
        this.showToast(title + ' adicionado ao carrinho', 'success', 1500);
    },

    _removeFromCart(id) {
        const idx = this._cart.items.findIndex(i => i.id === id);
        if (idx === -1) return;
        if (this._cart.items[idx].qty > 1) {
            this._cart.items[idx].qty -= 1;
        } else {
            this._cart.items.splice(idx, 1);
        }
        this._updateCartFAB();
        this._renderCartItems();
    },

    _updateCartFAB() {
        const fab = document.getElementById('store-cart-fab');
        const countEl = document.getElementById('store-cart-count');
        if (!fab) return;
        const total = this._cart.items.reduce((s, i) => s + i.qty, 0);
        fab.classList.toggle('hidden', total === 0);
        if (countEl) countEl.textContent = total;
    },

    _openCart() {
        const modal = document.getElementById('store-cart-modal');
        if (!modal) return;
        this._renderCartItems();
        modal.classList.remove('hidden');
    },

    _closeCart() {
        const modal = document.getElementById('store-cart-modal');
        if (modal) modal.classList.add('hidden');
    },

    _renderCartItems() {
        const list = document.getElementById('store-cart-items');
        const totalEl = document.getElementById('store-cart-total');
        if (!list) return;
        const ph = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='50'%3E%3Crect width='50' height='50' fill='%23e5e7eb'/%3E%3C/svg%3E";

        if (this._cart.items.length === 0) {
            list.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:32px 16px">Nenhum item no carrinho</p>';
            if (totalEl) totalEl.textContent = 'R$ 0,00';
            return;
        }

        list.innerHTML = this._cart.items.map(item => {
            const tEsc = (item.title || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const iEsc = (item.image || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return `
                <div class="cart-item">
                    <img src="${item.image || ph}" alt="${item.title || ''}" class="cart-item-img"
                         onerror="this.src='${ph}'">
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.title || ''}</div>
                        <div class="cart-item-price">${utils.formatCurrency(item.price * item.qty)}</div>
                    </div>
                    <div class="cart-item-controls">
                        <button type="button" class="cart-qty-btn" onclick="ui._removeFromCart('${item.id}')">
                            <i class="fas fa-minus"></i>
                        </button>
                        <span class="cart-qty-val">${item.qty}</span>
                        <button type="button" class="cart-qty-btn" onclick="ui._addToCart('${item.id}','${tEsc}',${item.price},'${iEsc}')">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        const total = this._cart.items.reduce((s, i) => s + i.price * i.qty, 0);
        if (totalEl) totalEl.textContent = utils.formatCurrency(total);
    },

    _sendCartWhatsApp() {
        if (!this._cart.merchantPhone) {
            this.showToast('Comerciante sem WhatsApp cadastrado', 'warning');
            return;
        }
        if (this._cart.items.length === 0) {
            this.showToast('Carrinho vazio', 'warning');
            return;
        }
        const lines = this._cart.items.map(i =>
            `• ${i.title} (x${i.qty}) — ${utils.formatCurrency(i.price * i.qty)}`
        );
        const total = this._cart.items.reduce((s, i) => s + i.price * i.qty, 0);
        const msg = [
            'Olá! Gostaria de fazer um pedido pelo PROMOCITY:',
            '',
            ...lines,
            '',
            `*Total: ${utils.formatCurrency(total)}*`
        ].join('\n');
        window.open(`https://wa.me/${this._cart.merchantPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    },

    // ==================== LOJAS PARCEIRAS ====================

    /**
     * Renderiza a seção "Lojas parceiras" na home.
     * Exibe apenas comerciantes (user_type=merchant) com foto de perfil válida.
     * Layout: scroll horizontal com duas linhas em grid.
     *
     * @param {Array} merchants - Array de perfis do tipo merchant
     */
    renderPartnerStores(merchants) {
        const container = document.getElementById('partner-stores-section');
        if (!container) return;

        const esc = utils.escapeHTML || utils.sanitizeInput;
        const safeUrl = (url, fallback = '') => (
            utils.sanitizeUrl
                ? utils.sanitizeUrl(url, { fallback, allowDataImage: false })
                : (url || fallback)
        );

        // Filtra merchants com foto válida (segurança extra)
        const validMerchants = (merchants || []).filter(m => {
            const url = (m.avatar_url || '').trim();
            return m.id != null && url.length > 0;
        });

        if (validMerchants.length === 0) {
            container.classList.add('hidden');
            return;
        }

        const cards = validMerchants.map(m => {
            const logoUrl = safeUrl(m.avatar_url, '');
            const storeName = esc(m.business_name || m.name || 'Loja');
            const userId = esc(String(m.id));
            return `
                <button
                    type="button"
                    class="partner-store-card"
                    data-merchant-id="${userId}"
                    aria-label="Ver loja ${storeName}"
                    title="${storeName}"
                >
                    <img
                        src="${logoUrl}"
                        alt="${storeName}"
                        class="partner-store-logo"
                        loading="lazy"
                        onerror="this.closest('.partner-store-card').style.display='none'"
                    >
                </button>
            `;
        }).join('');

        container.innerHTML = `
            <div class="partner-stores-header">
                <h2 class="partner-stores-title">
                    <i class="fas fa-store" aria-hidden="true"></i>
                    Lojas parceiras
                </h2>
            </div>
            <div class="partner-stores-grid" id="partner-stores-grid">
                ${cards}
            </div>
        `;

        container.classList.remove('hidden');

        // Listeners de clique para navegar ao perfil do comerciante
        container.querySelectorAll('.partner-store-card[data-merchant-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const merchantId = btn.getAttribute('data-merchant-id');
                if (merchantId && window.app && typeof window.app.loadProfileByAuthor === 'function') {
                    window.app.loadProfileByAuthor(merchantId);
                }
            });
        });
    }

};

// Exportação global
window.ui = ui;