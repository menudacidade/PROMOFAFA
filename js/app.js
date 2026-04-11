/**
 * APLICAÇÃO PRINCIPAL - PROMOCITY
 * Inicialização e controle de fluxo da aplicação
 * VERSÃO FINAL - Com upgrade/downgrade de tipo de usuário
 */

const app = {
    // Estado global
    state: {
        isLoading: false,
        currentScreen: 'login',
        stories: [],
        promotions: [],
        favorites: [],
        deliveryRequestPromo: null,
        deliveryRequestLat: null,
        deliveryRequestLng: null,
        currentDeliveryId: null,
        deliveryItems: [],           // [{name, qty, unitPrice, isMain, promoId, extraKey, sourceType}]
        merchantOtherPromos: [],     // promoções + destaques do mesmo comerciante
        deliveryLocationWatchId: null,
        deferredInstallPrompt: null,
        registerSubmitting: false,
        registerCooldownUntil: 0,
        registerCooldownTimer: null,
        registerSubmitOriginalLabel: '',
        pendingPromoDeepLink: null   // ID de promoção pendente de abertura via ?promo=ID
    },

    /**
     * Inicialização da aplicação
     */
    async init() {
        ui.init();
        ui.showLoading(true);

        // Captura deep link antes de qualquer navegação (preserva mesmo se a URL for limpa)
        this.state.pendingPromoDeepLink = new URLSearchParams(window.location.search).get('promo') || null;

        try {
            const isConnected = await window.checkSupabaseConnection();
            if (!isConnected) {
                throw new Error('Não foi possível conectar ao Supabase. Verifique sua conexão.');
            }

            const hasSession = await auth.init();

            this.setupEventListeners();
            this.setupAuthListener();
            this.setupNotificationsPolling();
            this.setupHistoryNavigation();

            if (hasSession) {
                await this.loadInitialData();
                ui.navigateTo('main', { historyMode: 'replace' });
                this.updateHeaderAvatar();
                await this.refreshNotificationsBadge();
                if (this._notificationsPollStart) this._notificationsPollStart();
                await this.initPushNotifications();
                // Abre promoção via deep link (?promo=ID) se houver
                this.handleDeepLink();
            } else {
                if (this._notificationsPollStop) this._notificationsPollStop();
                ui.navigateTo('login', { historyMode: 'replace' });
            }

        } catch (error) {
            console.error('❌ Erro na inicialização:', error);
            ui.showToast('Erro ao iniciar: ' + error.message, 'error', 5000);
            ui.navigateTo('login', { historyMode: 'replace' });
        } finally {
            ui.showLoading(false);
        }
    },

    // ==================== NOTIFICAÇÕES (IN-APP) ====================

    async loadNotifications() {
        try {
            const list = await db.getNotifications(50);
            ui.renderNotifications(list);
        } catch (e) {
            ui.showToast(e.message || 'Erro ao carregar notificações', 'error');
        }
    },

    async refreshNotificationsBadge() {
        if (!auth.isAuthenticated()) {
            ui.updateNotificationsBadge(0);
            return;
        }
        try {
            const count = await db.getUnreadNotificationsCount();
            ui.updateNotificationsBadge(count);
        } catch (_) {}
    },

    async openNotification(notificationId) {
        try {
            ui.markNotificationAsReadInList(notificationId);
            await db.markNotificationRead(notificationId);
            await this.refreshNotificationsBadge();
            await this.loadNotifications();
        } catch (_) {}
    },

    async openNotificationAction(notificationId, url) {
        await this.openNotification(notificationId);
        if (!url) return;
        if (String(url).startsWith('promocity://')) {
            ui.closeNotificationsModal();
            this.handlePromocityNavigation(url);
            return;
        }
        try { window.open(url, '_blank'); } catch (_) {}
    },

    async handlePromocityNavigation(url) {
        const u = String(url).trim();
        if (u.startsWith('promocity://story/')) {
            const authorId = u.replace('promocity://story/', '').split('/')[0];
            ui.navigateTo('main');
            if (!this.state.stories || this.state.stories.length === 0) await this.loadInitialData();
            setTimeout(() => this.viewAuthorStories(authorId), 150);
        } else if (u.startsWith('promocity://promo/')) {
            const promoId = u.replace('promocity://promo/', '').split('/')[0];
            ui.navigateTo('main');
            if (!this.state.promotions || this.state.promotions.length === 0) await this.loadInitialData();
            setTimeout(() => {
                const card = document.querySelector('.promo-card[data-id="' + promoId + '"]');
                if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        } else if (u === 'promocity://merchant-orders') {
            this.openMerchantOrders();
        } else if (u === 'promocity://my-deliveries') {
            this.openMyDeliveries();
        } else if (u === 'promocity://motoboy-dashboard') {
            this.openMotoboyDashboard();
        }
    },

    /**
     * Trata deep link via query string: ?promo=ID
     * Funciona em hospedagem estática sem servidor SPA — não gera 404.
     * Chamado após login ou no init quando já há sessão.
     */
    handleDeepLink() {
        const promoId = this.state.pendingPromoDeepLink;
        if (!promoId) return;

        // Limpa para não reabrir em navegações subsequentes
        this.state.pendingPromoDeepLink = null;

        // Remove parâmetro da URL (UX mais limpa) sem recarregar a página
        const cleanUrl = window.location.pathname + window.location.hash;
        if (window.history && window.history.replaceState) {
            window.history.replaceState({}, '', cleanUrl);
        }

        // Aguarda feed renderizado e faz scroll até o card
        const tryScroll = (attemptsLeft) => {
            const card = document.querySelector(`.promo-card[data-id="${promoId}"]`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Destaque visual temporário
                card.classList.add('promo-card--deeplink-highlight');
                setTimeout(() => card.classList.remove('promo-card--deeplink-highlight'), 2500);
            } else if (attemptsLeft > 0) {
                setTimeout(() => tryScroll(attemptsLeft - 1), 300);
            } else {
                ui.showToast('Promoção não encontrada ou já expirada.', 'info', 3000);
            }
        };

        // Garante que estamos na tela principal antes de rolar
        ui.navigateTo('main');
        setTimeout(() => tryScroll(6), 400);
    },

    /**
     * Notificações sem WebSocket: polling leve (aba visível) para manter o badge e a lista.
     * Evita erros de Realtime no console e não abre conexões duplicadas.
     */
    setupNotificationsPolling() {
        const POLL_MS = 45000;

        this._notificationsPollStop = () => {
            if (this._notificationsPollIntervalId != null) {
                clearInterval(this._notificationsPollIntervalId);
                this._notificationsPollIntervalId = null;
            }
        };

        this._notificationsPollStart = () => {
            this._notificationsPollStop();
            if (!auth.isAuthenticated()) {
                ui.updateNotificationsBadge(0);
                return;
            }
            this._notificationsPollIntervalId = setInterval(() => {
                if (!auth.isAuthenticated()) return;
                if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
                this.refreshNotificationsBadge();
                const open = !document.getElementById('notifications-modal')?.classList.contains('hidden');
                if (open) this.loadNotifications();
            }, POLL_MS);
        };
    },

    // ==================== PUSH (OneSignal) ====================
    async initPushNotifications() {
        const ONESIGNAL_APP_ID = window.ONESIGNAL_APP_ID || '';
        if (!ONESIGNAL_APP_ID || !window.OneSignal || !auth.isAuthenticated()) return;

        try {
            await window.OneSignal.init({
                appId: ONESIGNAL_APP_ID,
                allowLocalhostAsSecureOrigin: true,
                promptOptions: {
                    slidedown: {
                        prompts: [{
                            type: 'push',
                            autoPrompt: true,
                            text: {
                                actionMessage: 'Receba alertas de promoções e pedidos no seu celular!',
                                acceptButton: 'Ativar',
                                cancelButton: 'Agora não'
                            },
                            delay: { pageViews: 1, timeDelay: 3 }
                        }]
                    }
                }
            });

            const perm = await window.OneSignal.Notifications.permission;
            if (perm !== true) {
                // Tenta pedir permissão via slidedown (menos bloqueado por browsers)
                try {
                    await window.OneSignal.Slidedown.promptPush();
                } catch (_) {
                    await window.OneSignal.Notifications.requestPermission();
                }
            }

            const token = await window.OneSignal.User.PushSubscription.id;
            if (token) {
                await db.upsertPushToken('onesignal', token, {
                    ua: navigator.userAgent,
                    platform: navigator.platform
                });
            }
        } catch (e) {
            console.warn('Push init falhou:', e?.message || e);
        }
    },

    // Permite ativar notificações manualmente (chamado pelo botão no perfil)
    async enablePushNotifications() {
        const ONESIGNAL_APP_ID = window.ONESIGNAL_APP_ID || '';
        if (!ONESIGNAL_APP_ID || !window.OneSignal) {
            ui.showToast('Notificações push não disponíveis neste navegador', 'warning');
            return;
        }
        try {
            await window.OneSignal.Notifications.requestPermission();
            const granted = await window.OneSignal.Notifications.permission;
            if (granted) {
                ui.showToast('Notificações ativadas! ✅', 'success');
            } else {
                ui.showToast('Permissão negada. Ative nas configurações do navegador.', 'warning', 5000);
            }
        } catch (e) {
            ui.showToast('Não foi possível ativar notificações', 'error');
        }
    },

    /**
     * Carrega dados iniciais (feed e stories)
     */
    async loadInitialData() {
        const [storiesResult, promotionsResult] = await Promise.allSettled([
            db.getActiveStories(),
            db.getPromotions({ limit: 20 })
        ]);

        // Stories são opcionais — falha silenciosa para não bloquear o feed
        const stories = storiesResult.status === 'fulfilled' ? storiesResult.value : [];
        if (storiesResult.status === 'rejected') {
            console.warn('Stories indisponíveis:', storiesResult.reason?.message || storiesResult.reason);
        }

        // Promoções são essenciais — reporta erro se falhar
        if (promotionsResult.status === 'rejected') {
            console.error('Erro ao carregar promoções:', promotionsResult.reason);
            ui.showToast('Erro ao carregar feed', 'error');
            ui.renderStories(stories);
            return;
        }
        const promotions = promotionsResult.value;

        this.state.stories = stories;
        this.state.promotions = promotions;

        const promoIds = (promotions || []).map(p => p.id);
        let commentCounts = {};
        let likedIds = [];

        try {
            if (promoIds.length) {
                [commentCounts, likedIds] = await Promise.all([
                    db.getCommentCounts(promoIds).catch(() => ({})),
                    db.getUserLikedPromoIds(promoIds).catch(() => [])
                ]);
            }
        } catch (e) {
            console.warn('Erro ao carregar contagens:', e?.message || e);
        }

        const likedSet = new Set(likedIds.map(id => String(id)));
        const userFavorites = new Set(
            (auth.currentUser?.profile?.favorites || []).map(f => String(f))
        );

        promotions.forEach(p => {
            p.comments_count = commentCounts[p.id] ?? 0;
            p.isLiked = likedSet.has(String(p.id));
            p.isFavorited = userFavorites.has(String(p.id));
        });

        ui.renderStories(stories);
        ui.renderFeed(promotions);
    },

    /**
     * Configura listeners de eventos
     */
    setupEventListeners() {
        console.log('🔧 Configurando listeners...');

        // Navegação do bottom nav
        document.querySelectorAll('.nav-item:not(.nav-item-center)').forEach(item => {
            item.addEventListener('click', (e) => {
                const screen = e.currentTarget.dataset.screen;
                if (screen) {
                    const targetScreen = screen.replace('-screen', '');
                    ui.navigateTo(targetScreen);
                    
                    if (targetScreen === 'profile') {
                        this.loadProfile();
                    } else if (targetScreen === 'favorites') {
                        this.loadFavorites();
                    } else if (targetScreen === 'map') {
                        setTimeout(() => {
                            mapManager.init();
                            this.loadMapPromotions();
                        }, 200);
                    }
                }
            });
        });

        // Header: campo de busca leva para tela de busca
        const headerSearchTrigger = document.getElementById('header-search-trigger');
        if (headerSearchTrigger) {
            headerSearchTrigger.addEventListener('click', () => {
                ui.navigateTo('search');
                const searchInput = document.getElementById('search-input');
                if (searchInput) setTimeout(() => searchInput.focus(), 100);
            });
        }

        // Header: avatar abre perfil
        const btnHeaderProfile = document.getElementById('btn-header-profile');
        if (btnHeaderProfile) {
            btnHeaderProfile.addEventListener('click', () => {
                ui.navigateTo('profile');
                this.loadProfile();
            });
        }

        // Botão central
        const addMenuBtn = document.getElementById('btn-add-menu');
        const addMenu = document.getElementById('add-menu');
        const addStoryBtn = document.getElementById('add-story-btn');
        const addPromoBtn = document.getElementById('add-promo-btn');

        if (addMenuBtn && addMenu) {
            const newAddMenuBtn = addMenuBtn.cloneNode(true);
            addMenuBtn.parentNode.replaceChild(newAddMenuBtn, addMenuBtn);
            
            newAddMenuBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🎯 Botão central clicado!');
                addMenu.classList.toggle('hidden');
            });

            document.addEventListener('click', (e) => {
                if (addMenu && !addMenu.classList.contains('hidden')) {
                    if (!addMenu.contains(e.target) && e.target.id !== 'btn-add-menu') {
                        addMenu.classList.add('hidden');
                    }
                }
            });

            addMenu.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // Controle de visibilidade do botão central
        const updateAddButtonVisibility = () => {
            const addMenuBtn = document.getElementById('btn-add-menu');
            if (!addMenuBtn) return;
            
            if (auth.isAuthenticated() && auth.isMerchant()) {
                addMenuBtn.style.display = 'flex';
            } else {
                addMenuBtn.style.display = 'none';
            }
        };
        updateAddButtonVisibility();

        if (addStoryBtn) {
            const newAddStoryBtn = addStoryBtn.cloneNode(true);
            addStoryBtn.parentNode.replaceChild(newAddStoryBtn, addStoryBtn);
            
            newAddStoryBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                if (addMenu) addMenu.classList.add('hidden');
                
                if (!auth.isAuthenticated()) {
                    ui.showToast('Faça login primeiro', 'warning');
                    ui.navigateTo('login');
                    return;
                }
                
                ui.navigateTo('story-publish');
            });
        }

        if (addPromoBtn) {
            const newAddPromoBtn = addPromoBtn.cloneNode(true);
            addPromoBtn.parentNode.replaceChild(newAddPromoBtn, addPromoBtn);
            
            newAddPromoBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                if (addMenu) addMenu.classList.add('hidden');
                
                if (!auth.isAuthenticated()) {
                    ui.showToast('Faça login primeiro', 'warning');
                    ui.navigateTo('login');
                    return;
                }
                
                if (!auth.isMerchant()) {
                    ui.showToast('Apenas comerciantes podem publicar promoções', 'warning');
                    return;
                }
                
                ui.navigateTo('publish');
            });
        }

        // Botões de voltar (respeita data-target quando existir; ignora os que têm handler próprio)
        document.querySelectorAll('.back-btn').forEach(btn => {
            if (['delivery-request-back', 'delivery-tracking-back', 'delivery-detail-back'].includes(btn.id)) return;
            btn.addEventListener('click', () => {
                const target = (btn.dataset.target || 'main').replace('-screen', '');
                if (window.history.length > 1) {
                    window.history.back();
                } else {
                    ui.navigateTo(target, { historyMode: 'replace' });
                }
            });
        });

        // Login
        const loginForm = document.getElementById('login-form');
        loginForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleLogin();
        });

        // Botão para instalar o app (PWA)
        const installBtn = document.getElementById('install-app-btn');
        if (installBtn) {
            installBtn.addEventListener('click', async () => {
                const promptEvent = this.state.deferredInstallPrompt;
                if (!promptEvent) {
                    ui.showToast('Instalação não disponível neste navegador.', 'info');
                    return;
                }
                promptEvent.prompt();
                const choice = await promptEvent.userChoice;
                if (choice.outcome === 'accepted') {
                    ui.showToast('App instalado com sucesso!', 'success');
                }
                installBtn.classList.add('hidden');
                this.state.deferredInstallPrompt = null;
            });
        }

        // Esqueci a senha
        document.getElementById('show-recover')?.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = window.prompt('Digite seu e-mail para receber o link de redefinição de senha:');
            if (!email) return;
            try {
                ui.showLoading(true);
                await auth.resetPassword(email.trim());
                ui.showToast('Link de redefinição enviado! Verifique seu e-mail.', 'success');
            } catch (err) {
                ui.showToast(err.message || 'Erro ao enviar e-mail de recuperação', 'error');
            } finally {
                ui.showLoading(false);
            }
        });

        // Atualizar mapa
        document.getElementById('btn-refresh-map')?.addEventListener('click', () => {
            this.loadMapPromotions();
        });

        // Cadastro
        document.getElementById('register-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleRegister();
        });
        this._syncRegisterCooldownUi();

        // Sino de notificações
        document.getElementById('btn-notifications')?.addEventListener('click', async () => {
            if (!auth.isAuthenticated()) {
                ui.showToast('Faça login para ver notificações', 'warning');
                ui.navigateTo('login');
                return;
            }
            ui.openNotificationsModal();
            await this.loadNotifications();
        });
        document.getElementById('notifications-close')?.addEventListener('click', () => ui.closeNotificationsModal());
        document.getElementById('notifications-refresh')?.addEventListener('click', () => this.loadNotifications());
        document.getElementById('comments-modal-close')?.addEventListener('click', () => ui.showCommentsModal(false));
        document.getElementById('comment-submit')?.addEventListener('click', () => this.submitComment());
        const commentInput = document.getElementById('comment-input');
        if (commentInput) {
            commentInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.submitComment();
                }
            });
        }
        document.getElementById('notifications-mark-all-read')?.addEventListener('click', async () => {
            try {
                await db.markAllNotificationsRead();
                await this.refreshNotificationsBadge();
                await this.loadNotifications();
            } catch (e) {
                ui.showToast(e.message || 'Erro ao marcar como lidas', 'error');
            }
        });

        // Links de navegação auth
        document.getElementById('show-register')?.addEventListener('click', (e) => {
            e.preventDefault();
            ui.navigateTo('register');
        });

        document.getElementById('show-login')?.addEventListener('click', (e) => {
            e.preventDefault();
            ui.navigateTo('login');
        });

        // Upload de imagem preview
        const imageUpload = document.getElementById('image-upload-area');
        const fileInput = document.getElementById('promo-image');
        const preview = document.getElementById('image-preview');

        if (imageUpload && fileInput) {
            imageUpload.addEventListener('click', () => fileInput.click());
        }
        
        if (fileInput && preview) {
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        preview.src = event.target.result;
                        preview.classList.remove('hidden');
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

        // Publicar promoção
        const publishForm = document.getElementById('publish-form');
        if (publishForm) {
            publishForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handlePublish();
            });
        }

        const highlightUpload = document.getElementById('highlight-image-upload-area');
        const highlightFileInput = document.getElementById('highlight-image');
        const highlightPreview = document.getElementById('highlight-image-preview');
        if (highlightUpload && highlightFileInput) {
            highlightUpload.addEventListener('click', () => highlightFileInput.click());
        }
        if (highlightFileInput && highlightPreview) {
            highlightFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        highlightPreview.src = ev.target.result;
                        highlightPreview.classList.remove('hidden');
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
        document.getElementById('highlight-edit-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleHighlightSubmit();
        });

        // Busca
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', utils.debounce(async (e) => {
                const term = e.target.value;
                if (term.length > 2) {
                    const results = await db.getPromotions({ search: term, limit: 20 });
                    const ids = (results || []).map(p => p.id);
                    let counts = {};
                    try { if (ids.length) counts = await db.getCommentCounts(ids); } catch (_) {}
                    results.forEach(p => { p.comments_count = counts[p.id] ?? 0; });
                    ui.renderFeed(results, ui.elements.searchResults);
                } else if (term.length === 0) {
                    ui.elements.searchResults.innerHTML = '';
                }
            }, 500));
        }

        this.setupMerchantSearchAutocomplete();

        // Categorias
        document.querySelectorAll('.category-card').forEach(card => {
            card.addEventListener('click', async () => {
                const category = card.dataset.category;
                const results = await db.getPromotions({ category, limit: 20 });
                const ids = (results || []).map(p => p.id);
                let counts = {};
                try { if (ids.length) counts = await db.getCommentCounts(ids); } catch (_) {}
                results.forEach(p => { p.comments_count = counts[p.id] ?? 0; });
                ui.renderFeed(results, ui.elements.searchResults);
            });
        });

        // Fechar story
        document.getElementById('close-story')?.addEventListener('click', () => {
            ui.closeStoryViewer();
        });

        // Menu de ações do perfil (3 pontinhos)
        const editProfileBtn = document.getElementById('btn-edit-profile');
        const profileActionsMenu = document.getElementById('profile-actions-menu');
        const profileActionsContent = document.getElementById('profile-actions-menu-content');
        if (editProfileBtn) {
            editProfileBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleProfileActionsMenu();
            });
        }
        profileActionsContent?.addEventListener('click', (e) => {
            const btn = e.target.closest('.profile-actions-item');
            if (!btn) return;
            const action = btn.dataset.action;
            if (!action) return;
            this.handleProfileMenuAction(action);
        });
        document.addEventListener('click', (e) => {
            if (!profileActionsMenu || profileActionsMenu.classList.contains('hidden')) return;
            if (profileActionsMenu.contains(e.target)) return;
            if (editProfileBtn && editProfileBtn.contains(e.target)) return;
            this.closeProfileActionsMenu();
        });

        // Salvar perfil
        const saveProfileBtn = document.getElementById('btn-save-profile');
        if (saveProfileBtn) {
            saveProfileBtn.addEventListener('click', async (e) => {
                e.preventDefault();

                const updatedData = {
                    name: document.getElementById('edit-name')?.value || '',
                    phone: document.getElementById('edit-phone')?.value || '',
                };

                if (auth.currentUser?.profile?.user_type === 'merchant') {
                    updatedData.business_name = document.getElementById('edit-business-name')?.value || '';
                    updatedData.business_address = document.getElementById('edit-business-address')?.value || '';
                    updatedData.business_category = document.getElementById('edit-business-category')?.value || '';
                    updatedData.business_store_link = document.getElementById('edit-business-store-link')?.value || '';

                    // Coleta informações customizadas da loja
                    const storeInfoRows = document.querySelectorAll('#store-info-list .store-info-item-row');
                    const storeInfoArray = [];
                    storeInfoRows.forEach(row => {
                        const icon  = row.querySelector('.store-info-icon-select')?.value || 'fas fa-info-circle';
                        const label = (row.querySelector('.store-info-label-input')?.value || '').trim();
                        const value = (row.querySelector('.store-info-value-input')?.value || '').trim();
                        if (label && value) storeInfoArray.push({ icon, label, value });
                    });
                    updatedData.store_info = storeInfoArray;

                    const latField = document.getElementById('edit-business-latitude');
                    const lngField = document.getElementById('edit-business-longitude');
                    
                    if (latField) updatedData.latitude = latField.value ? parseFloat(latField.value) : null;
                    if (lngField) updatedData.longitude = lngField.value ? parseFloat(lngField.value) : null;
                }

                await this.saveProfile(updatedData);
            });
        }

        // Upload de avatar na tela de edição
        const editAvatarInput = document.getElementById('edit-avatar-input');
        const editAvatarArea = document.getElementById('edit-avatar-area');
        if (editAvatarArea && editAvatarInput) {
            editAvatarArea.addEventListener('click', (e) => {
                e.stopPropagation(); // não propaga para o cover-area
                editAvatarInput.click();
            });
        }
        if (editAvatarInput) {
            editAvatarInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                ui.showLoading(true);
                try {
                    const result = await auth.updateAvatar(file);
                    if (result.success) {
                        ui.showToast('Foto atualizada!', 'success');
                        document.getElementById('edit-avatar-preview').src = result.url;
                    } else {
                        ui.showToast(result.error, 'error');
                    }
                } catch (error) {
                    ui.showToast('Erro ao atualizar foto: ' + error.message, 'error');
                } finally {
                    ui.showLoading(false);
                }
            });
        }

        // Upload de foto de capa do perfil (input na profile-screen)
        const profileCoverInput = document.getElementById('profile-cover-input');
        if (profileCoverInput) {
            profileCoverInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                ui.showLoading(true);
                try {
                    const result = await auth.updateCoverImage(file);
                    if (result.success) {
                        ui.showToast('Foto de capa atualizada!', 'success');
                        this.loadProfile();
                    } else {
                        ui.showToast(result.error || 'Erro ao salvar capa', 'error');
                    }
                } catch (err) {
                    ui.showToast('Erro ao atualizar capa: ' + err.message, 'error');
                } finally {
                    ui.showLoading(false);
                    profileCoverInput.value = '';
                }
            });
        }

        // Clique na área de capa da tela de edição abre o seletor de arquivo
        const editCoverInput = document.getElementById('edit-cover-input');
        const editCoverArea = document.getElementById('edit-cover-area');
        if (editCoverArea && editCoverInput) {
            editCoverArea.addEventListener('click', (e) => {
                if (e.target.closest('#edit-avatar-area')) return; // avatar tem seu próprio handler
                editCoverInput.click();
            });
        }
        if (editCoverInput) {
            editCoverInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                ui.showLoading(true);
                try {
                    const result = await auth.updateCoverImage(file);
                    if (result.success) {
                        ui.showToast('Foto de capa atualizada!', 'success');
                        const coverPreview = document.getElementById('edit-cover-preview');
                        if (coverPreview) {
                            coverPreview.src = result.url;
                        }
                    } else {
                        ui.showToast(result.error || 'Erro ao salvar capa', 'error');
                    }
                } catch (err) {
                    ui.showToast('Erro ao atualizar capa: ' + err.message, 'error');
                } finally {
                    ui.showLoading(false);
                    editCoverInput.value = '';
                }
            });
        }

        // Delegação de clique para botões de cover (gerados dinamicamente no hero)
        document.getElementById('profile-screen')?.addEventListener('click', async (e) => {
            if (e.target.closest('#btn-cover-edit')) {
                e.preventDefault();
                e.stopPropagation();
                profileCoverInput?.click();
                return;
            }
            if (e.target.closest('#btn-cover-remove')) {
                e.preventDefault();
                e.stopPropagation();
                if (!confirm('Remover foto de capa?')) return;
                ui.showLoading(true);
                try {
                    const result = await auth.removeCoverImage();
                    if (result.success) {
                        ui.showToast('Capa removida!', 'success');
                        this.loadProfile();
                    } else {
                        ui.showToast(result.error || 'Erro ao remover capa', 'error');
                    }
                } catch (err) {
                    ui.showToast('Erro ao remover capa: ' + err.message, 'error');
                } finally {
                    ui.showLoading(false);
                }
            }
        });

        // Upload de story
        const storyImageUpload = document.getElementById('story-image-upload-area');
        const storyFileInput = document.getElementById('story-image');
        const storyPreview = document.getElementById('story-image-preview');

        if (storyImageUpload && storyFileInput) {
            storyImageUpload.addEventListener('click', () => storyFileInput.click());
        }

        if (storyFileInput && storyPreview) {
            storyFileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        storyPreview.src = event.target.result;
                        storyPreview.classList.remove('hidden');
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

        // Publicar story
        const storyPublishForm = document.getElementById('story-publish-form');
        if (storyPublishForm) {
            storyPublishForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handlePublishStory();
            });
        }

        // Pedido com entrega: voltar
        document.getElementById('delivery-request-back')?.addEventListener('click', () => {
            this.state.deliveryRequestPromo = null;
            this.state.deliveryRequestLat = null;
            this.state.deliveryRequestLng = null;
            this.state.deliveryGPSAddress = null;
            this.state.deliveryItems = [];
            this.state.merchantOtherPromos = [];
            ui.navigateTo('main');
        });
        // Pedido com entrega: formulário
        document.getElementById('delivery-request-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.confirmDeliveryRequest();
        });
        // Localização via GPS
        document.getElementById('btn-use-gps-location')?.addEventListener('click', () => this.captureGPSLocation());

        // Localização manual (digitar)
        document.getElementById('btn-use-manual-address')?.addEventListener('click', () => {
            document.getElementById('gps-location-preview')?.classList.add('hidden');
            document.getElementById('manual-address-input')?.classList.remove('hidden');
            document.getElementById('delivery-address')?.focus();
        });

        // Mudar localização (volta ao modo de escolha)
        document.getElementById('btn-change-location')?.addEventListener('click', () => {
            document.getElementById('gps-location-preview')?.classList.add('hidden');
            document.getElementById('manual-address-input')?.classList.add('hidden');
            this.state.deliveryRequestLat = null;
            this.state.deliveryRequestLng = null;
            this.recalcDeliveryFee();
        });

        // Forma de pagamento: mostrar/esconder campo de troco
        document.querySelectorAll('input[name="payment_method"]').forEach(radio => {
            radio.addEventListener('change', () => {
                const trocoGroup = document.getElementById('troco-group');
                if (trocoGroup) trocoGroup.classList.toggle('hidden', radio.value !== 'dinheiro');
            });
        });

        // Modal motoboy: escolher veículo
        document.querySelectorAll('.btn-vehicle').forEach(btn => {
            btn.addEventListener('click', () => this.confirmMotoboyActivation(btn.dataset.vehicle));
        });
        document.getElementById('motoboy-vehicle-cancel')?.addEventListener('click', () => {
            document.getElementById('motoboy-vehicle-modal')?.classList.add('hidden');
        });

        // Abas dashboard motoboy
        document.querySelectorAll('.motoboy-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.motoboy-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.motoboy-tab-content').forEach(c => c.classList.add('hidden'));
                tab.classList.add('active');
                const tabName = tab.dataset.tab;
                const contentId = tabName === 'available' ? 'motoboy-available-list' : tabName === 'in_progress' ? 'motoboy-in-progress-list' : 'motoboy-history-list';
                document.getElementById(contentId)?.classList.remove('hidden');
            });
        });

        // Rastreio: voltar
        document.getElementById('delivery-tracking-back')?.addEventListener('click', () => {
            ui.navigateTo(this.state.currentDeliveryId ? 'profile' : 'main');
        });
        // Detalhe entrega motoboy: voltar
        document.getElementById('delivery-detail-back')?.addEventListener('click', () => {
            this.openMotoboyDashboard();
        });
    },

    closeProfileActionsMenu() {
        const menu = document.getElementById('profile-actions-menu');
        if (!menu) return;
        const focused = menu.querySelector(':focus');
        if (focused) focused.blur();
        menu.classList.add('hidden');
        menu.setAttribute('aria-hidden', 'true');
    },

    _buildProfileActionsItems() {
        const me = auth.currentUser;
        if (!me || !me.profile) return [];

        const isOwnerView = !!document.querySelector('#profile-content .profile-menu');
        const isMerchant = me.profile.user_type === 'merchant';
        const isMotoboy = me.profile.is_motoboy === true;

        if (!isOwnerView) {
            return [
                { action: 'go_my_profile', icon: 'fa-user', label: 'Meu perfil' },
                { action: 'logout', icon: 'fa-sign-out-alt', label: 'Sair da conta', danger: true }
            ];
        }

        const items = [];
        items.push({
            action: isMerchant ? 'merchant_details' : 'edit_profile',
            icon: isMerchant ? 'fa-id-card' : 'fa-user',
            label: isMerchant ? 'Dados da loja e contato' : 'Informações do perfil'
        });
        items.push({ action: 'edit_profile', icon: 'fa-pen-to-square', label: 'Editar perfil' });

        if (isMerchant) {
            items.push({ action: 'publish_promo', icon: 'fa-plus-circle', label: 'Publicar promoção' });
            items.push({ action: 'merchant_orders', icon: 'fa-shopping-bag', label: 'Pedidos de entrega' });
            items.push({ action: 'downgrade_consumer', icon: 'fa-user', label: 'Ser apenas consumidor' });
        } else {
            items.push({ action: 'upgrade_merchant', icon: 'fa-store', label: 'Anunciar meu negócio' });
            items.push({ action: 'my_deliveries', icon: 'fa-shopping-bag', label: 'Meus pedidos com entrega' });
            if (isMotoboy) {
                items.push({ action: 'motoboy_dashboard', icon: 'fa-motorcycle', label: 'Ver entregas (motoboy)' });
                items.push({ action: 'deactivate_motoboy', icon: 'fa-user', label: 'Parar de ser motoboy' });
            } else {
                items.push({ action: 'motoboy_vehicle', icon: 'fa-motorcycle', label: 'Quero ser motoboy' });
            }
        }

        items.push({ action: 'logout', icon: 'fa-sign-out-alt', label: 'Sair da conta', danger: true });
        return items;
    },

    toggleProfileActionsMenu() {
        const menu = document.getElementById('profile-actions-menu');
        const content = document.getElementById('profile-actions-menu-content');
        if (!menu || !content) return;

        const isHidden = menu.classList.contains('hidden');
        if (!isHidden) {
            this.closeProfileActionsMenu();
            return;
        }

        const items = this._buildProfileActionsItems();
        if (!items.length) {
            ui.showToast('Nenhuma ação disponível neste perfil.', 'info');
            return;
        }

        content.innerHTML = items.map((item) => `
            <button type="button" class="profile-actions-item ${item.danger ? 'danger' : ''}" data-action="${item.action}">
                <span class="profile-actions-item-icon"><i class="fas ${item.icon}"></i></span>
                <span class="profile-actions-item-label">${item.label}</span>
            </button>
        `).join('');

        menu.classList.remove('hidden');
        menu.setAttribute('aria-hidden', 'false');
    },

    handleProfileMenuAction(action) {
        this.closeProfileActionsMenu();

        if (action === 'merchant_details') {
            ui.toggleMerchantProfileDetails();
            return;
        }
        if (action === 'edit_profile') {
            this.editProfile();
            return;
        }
        if (action === 'publish_promo') {
            this.navigateToPublish();
            return;
        }
        if (action === 'merchant_orders') {
            this.openMerchantOrders();
            return;
        }
        if (action === 'downgrade_consumer') {
            this.downgradeToConsumer();
            return;
        }
        if (action === 'upgrade_merchant') {
            this.upgradeToMerchant();
            return;
        }
        if (action === 'my_deliveries') {
            this.openMyDeliveries();
            return;
        }
        if (action === 'motoboy_vehicle') {
            this.openMotoboyVehicleModal();
            return;
        }
        if (action === 'motoboy_dashboard') {
            this.openMotoboyDashboard();
            return;
        }
        if (action === 'deactivate_motoboy') {
            this.deactivateMotoboy();
            return;
        }
        if (action === 'change_cover') {
            document.getElementById('profile-cover-input')?.click();
            return;
        }
        if (action === 'remove_cover') {
            if (!confirm('Remover foto de capa?')) return;
            ui.showLoading(true);
            auth.removeCoverImage().then(result => {
                if (result.success) {
                    ui.showToast('Capa removida!', 'success');
                    this.loadProfile();
                } else {
                    ui.showToast(result.error || 'Erro ao remover capa', 'error');
                }
            }).catch(err => {
                ui.showToast('Erro: ' + err.message, 'error');
            }).finally(() => {
                ui.showLoading(false);
            });
            return;
        }
        if (action === 'go_my_profile') {
            ui.navigateTo('profile');
            this.loadProfile();
            return;
        }
        if (action === 'logout') {
            this.logout();
        }
    },

    /**
     * Listener de mudanças de autenticação
     */
    setupAuthListener() {
        auth.onAuthStateChange((event, user) => {
            if (event === 'SIGNED_IN') {
                this.loadInitialData();
                ui.navigateTo('main', { historyMode: 'replace' });
                // Não exibe toast aqui: handleLogin já exibe "Login realizado com sucesso!"
                // para evitar dois toasts sobrepostos ao mesmo tempo.
                this.updateHeaderAvatar();

                const addMenuBtn = document.getElementById('btn-add-menu');
                if (addMenuBtn) {
                    addMenuBtn.style.display = auth.isMerchant() ? 'flex' : 'none';
                }

                this.refreshNotificationsBadge();
                if (this._notificationsPollStart) this._notificationsPollStart();
                this.initPushNotifications();
                // Abre promoção via deep link se o usuário veio de um link compartilhado
                setTimeout(() => this.handleDeepLink(), 600);
                
            } else if (event === 'SIGNED_OUT') {
                if (this._notificationsPollStop) this._notificationsPollStop();

                ui.navigateTo('login', { historyMode: 'replace' });
                ui.showToast('Você saiu da conta', 'info');
                this.updateHeaderAvatar();
                
                const addMenuBtn = document.getElementById('btn-add-menu');
                if (addMenuBtn) {
                    addMenuBtn.style.display = 'none';
                }

                ui.updateNotificationsBadge(0);
            }
        });
    },

    _getRegisterSubmitButton() {
        const registerForm = document.getElementById('register-form');
        return registerForm?.querySelector('button[type="submit"]') || null;
    },

    _getRegisterCooldownRemainingMs() {
        const remaining = (this.state.registerCooldownUntil || 0) - Date.now();
        return Math.max(0, remaining);
    },

    _syncRegisterCooldownUi() {
        const btn = this._getRegisterSubmitButton();
        if (!btn) return;

        if (!this.state.registerSubmitOriginalLabel) {
            this.state.registerSubmitOriginalLabel = btn.innerHTML;
        }

        const remainingMs = this._getRegisterCooldownRemainingMs();
        const inCooldown = remainingMs > 0;
        btn.disabled = inCooldown || this.state.registerSubmitting;

        if (inCooldown) {
            const remainingSec = Math.ceil(remainingMs / 1000);
            btn.innerHTML = `<i class="fas fa-hourglass-half"></i> Aguarde ${remainingSec}s`;
        } else if (!this.state.registerSubmitting) {
            btn.innerHTML = this.state.registerSubmitOriginalLabel;
        }
    },

    _startRegisterCooldown(seconds = 60) {
        this.state.registerCooldownUntil = Date.now() + (seconds * 1000);
        if (this.state.registerCooldownTimer) {
            clearInterval(this.state.registerCooldownTimer);
            this.state.registerCooldownTimer = null;
        }

        this._syncRegisterCooldownUi();

        this.state.registerCooldownTimer = setInterval(() => {
            const remainingMs = this._getRegisterCooldownRemainingMs();
            if (remainingMs <= 0) {
                clearInterval(this.state.registerCooldownTimer);
                this.state.registerCooldownTimer = null;
                this.state.registerCooldownUntil = 0;
            }
            this._syncRegisterCooldownUi();
        }, 1000);
    },

    async handleLogin() {
        const email = document.getElementById('login-email')?.value || '';
        const password = document.getElementById('login-password')?.value || '';

        ui.showLoading(true);
        let result;
        try {
            result = await auth.login(email, password);
        } catch (err) {
            ui.showLoading(false);
            ui.showToast(err?.message || 'Erro ao fazer login', 'error');
            return;
        }
        ui.showLoading(false);

        if (result.success) {
            ui.showToast('Login realizado com sucesso!', 'success');
        } else {
            ui.showToast(result.error, 'error');
        }
    },

    async handleRegister() {
        if (this.state.registerSubmitting) return;

        const cooldownRemainingMs = this._getRegisterCooldownRemainingMs();
        if (cooldownRemainingMs > 0) {
            const cooldownSec = Math.ceil(cooldownRemainingMs / 1000);
            this._syncRegisterCooldownUi();
            ui.showToast(`Aguarde ${cooldownSec}s para tentar novo cadastro.`, 'warning');
            return;
        }

        const userData = {
            name: document.getElementById('register-name')?.value || '',
            email: document.getElementById('register-email')?.value || '',
            password: document.getElementById('register-password')?.value || '',
            phone: document.getElementById('register-phone')?.value || '',
            userType: 'consumer'
        };
        let shouldStartCooldown = false;

        try {
            this.state.registerSubmitting = true;
            this._syncRegisterCooldownUi();
            ui.showLoading(true);
            const result = await auth.register(userData);
            if (result.success) {
                if (result.requiresEmailConfirmation) {
                    ui.showToast('Conta criada! Verifique seu email para ativar o acesso.', 'success');
                    ui.navigateTo('login');
                } else {
                    ui.showToast('Conta criada com sucesso! Entrando...', 'success');
                }
            } else {
                ui.showToast(result.error, 'error');
                shouldStartCooldown = result.code === 'rate_limit';
            }
        } catch (err) {
            ui.showToast(err.message || 'Erro ao criar conta. Tente novamente.', 'error');
        } finally {
            ui.showLoading(false);
            this.state.registerSubmitting = false;
            if (shouldStartCooldown) {
                this._startRegisterCooldown(60);
            } else {
                this.state.registerCooldownUntil = 0;
                if (this.state.registerCooldownTimer) {
                    clearInterval(this.state.registerCooldownTimer);
                    this.state.registerCooldownTimer = null;
                }
            }
            this._syncRegisterCooldownUi();
        }
    },

    async handlePublishStory() {
        const fileInput = document.getElementById('story-image');
        const whatsappInput = document.getElementById('story-whatsapp');
        const captionInput = document.getElementById('story-caption');
        const expiresInput = document.getElementById('story-expires');

        if (!fileInput || !whatsappInput || !captionInput || !expiresInput) {
            ui.showToast('Erro interno: formulário não carregado', 'error');
            return;
        }

        const file = fileInput.files[0];
        if (!file) {
            ui.showToast('Selecione uma imagem para o story', 'warning');
            return;
        }

        const whatsapp = whatsappInput.value.trim();
        const caption = captionInput.value.trim();
        const expiresAt = expiresInput.value;

        if (!expiresAt) {
            ui.showToast('Defina a validade do story', 'warning');
            return;
        }

        ui.showLoading(true);

        try {
            let fileToUpload = file;
            try {
                fileToUpload = await utils.compressImage(file, 1200, 0.8);
            } catch (compressErr) {
                fileToUpload = file;
            }
            const imageUrl = await db.uploadImage(fileToUpload, 'stories', auth.currentUser.id);
            await db.createStory(imageUrl, whatsapp || null, caption || null, new Date(expiresAt).toISOString());

            const authorName = auth.currentUser?.profile?.business_name || auth.currentUser?.profile?.name || 'Um comerciante';
            db.notifyUsersAboutNewStory(auth.currentUser.id, authorName).catch(() => {});

            ui.showToast('Story publicado com sucesso!', 'success');

            document.getElementById('story-publish-form')?.reset();
            const storyPreview = document.getElementById('story-image-preview');
            if (storyPreview) storyPreview.classList.add('hidden');

            const stories = await db.getActiveStories();
            this.state.stories = stories;
            ui.renderStories(stories);

            ui.navigateTo('main');

        } catch (error) {
            console.error('❌ Erro ao publicar story:', error);
            const msg = (error && error.message) ? error.message : String(error);
            ui.showToast('Erro ao publicar story: ' + msg, 'error');
        } finally {
            ui.showLoading(false);
        }
    },

    navigateToPublish() {
        ui.navigateTo('publish');
        const publishForm = document.getElementById('publish-form');
        if (publishForm) {
            publishForm.dataset.mode = '';
            publishForm.dataset.promoId = '';
            const submitBtn = publishForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Publicar Promoção';
            }
            const preview = document.getElementById('image-preview');
            if (preview) preview.classList.add('hidden');
            publishForm.reset();
            // Valor padrão para validade (mobile: datetime-local pode vir vazio)
            const expiresInput = document.getElementById('promo-expires');
            if (expiresInput) {
                const d = new Date();
                d.setDate(d.getDate() + 7);
                expiresInput.value = d.toISOString().slice(0, 16);
            }
        }
    },

    async editPromo(promoId) {
        console.log('✏️ editPromo chamado com ID:', promoId);
        
        let promo = this.state.promotions.find(p => p.id === promoId);
        
        if (!promo) {
            console.log('🔄 Buscando promoção no banco de dados...');
            try {
                const { data, error } = await supabaseClient
                    .from('promotions')
                    .select('*')
                    .eq('id', promoId)
                    .maybeSingle();
                
                if (error) throw error;
                if (!data) {
                    ui.showToast('Promoção não encontrada', 'error');
                    return;
                }
                promo = data;
            } catch (error) {
                console.error('❌ Erro ao buscar promoção:', error);
                ui.showToast('Erro ao carregar dados da promoção', 'error');
                return;
            }
        }

        try {
            document.getElementById('promo-title').value = promo.title || '';
            document.getElementById('promo-description').value = promo.description || '';
            document.getElementById('promo-old-price').value = promo.old_price || '';
            document.getElementById('promo-new-price').value = promo.new_price || '';
            document.getElementById('promo-hot').checked = promo.is_hot || false;
            document.getElementById('promo-category').value = promo.category || '';

            if (promo.expires_at) {
                const expiresDate = new Date(promo.expires_at).toISOString().slice(0, 16);
                document.getElementById('promo-expires').value = expiresDate;
            }

            const preview = document.getElementById('image-preview');
            if (promo.image_url) {
                preview.src = promo.image_url;
                preview.classList.remove('hidden');
            } else {
                preview.classList.add('hidden');
            }

            const oldHidden = document.getElementById('promo-current-image');
            if (oldHidden) oldHidden.remove();

            const hiddenInput = document.createElement('input');
            hiddenInput.type = 'hidden';
            hiddenInput.id = 'promo-current-image';
            hiddenInput.value = promo.image_url || '';
            document.getElementById('publish-form').appendChild(hiddenInput);

            const publishForm = document.getElementById('publish-form');
            publishForm.dataset.mode = 'edit';
            publishForm.dataset.promoId = promoId;

            const submitBtn = publishForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.innerHTML = '<i class="fas fa-save"></i> Atualizar Promoção';
            }

            console.log('✅ Formulário preenchido');
            ui.navigateTo('publish');
            
        } catch (error) {
            console.error('❌ Erro ao preencher formulário:', error);
            ui.showToast('Erro ao preparar edição', 'error');
        }
    },

    confirmDeletePromo(promoId) {
        console.log('🗑️ confirmDeletePromo chamado com ID:', promoId);
        if (confirm('Tem certeza que deseja excluir esta promoção?')) {
            this.deletePromo(promoId);
        }
    },

    async deletePromo(promoId) {
        console.log('❌ deletePromo chamado com ID:', promoId);
        ui.showLoading(true);
        
        try {
            await db.deletePromotion(promoId);
            ui.showToast('Promoção excluída!', 'success');
            await this.loadInitialData();
            
        } catch (error) {
            console.error('❌ Erro ao excluir:', error);
            ui.showToast('Erro ao excluir: ' + error.message, 'error');
        } finally {
            ui.showLoading(false);
        }
    },

    async deleteStory(storyId) {
        console.log('❌ deleteStory chamado com ID:', storyId);
        if (!confirm('Excluir este story?')) return;

        ui.showLoading(true);
        try {
            await db.deleteStory(storyId);
            ui.showToast('Story excluído!', 'success');

            const stories = await db.getActiveStories();
            this.state.stories = stories;
            ui.renderStories(stories);

            ui.closeStoryViewer();
        } catch (error) {
            console.error('Erro ao excluir story:', error);
            ui.showToast('Erro ao excluir story', 'error');
        } finally {
            ui.showLoading(false);
        }
    },

    openHighlightEditor(highlightId) {
        if (!auth.isAuthenticated() || auth.currentUser?.profile?.user_type !== 'merchant') {
            ui.showToast('Somente comerciantes podem gerenciar destaques', 'warning');
            return;
        }
        const form = document.getElementById('highlight-edit-form');
        if (!form) return;

        form.reset();
        const idInput = document.getElementById('highlight-edit-id');
        if (idInput) idInput.value = '';
        const prev = document.getElementById('highlight-image-preview');
        if (prev) {
            prev.classList.add('hidden');
            prev.removeAttribute('src');
        }
        document.getElementById('highlight-current-image')?.remove();
        const hFile = document.getElementById('highlight-image');
        if (hFile) hFile.value = '';

        const titleEl = document.getElementById('highlight-edit-header-title');
        const submitBtn = document.getElementById('highlight-form-submit');

        if (highlightId) {
            const list = auth.currentUser.profile.store_highlights || [];
            const h = list.find(x => String(x.id) === String(highlightId));
            if (!h) {
                ui.showToast('Destaque não encontrado. Abra o perfil novamente.', 'warning');
                return;
            }
            if (idInput) idInput.value = h.id;
            const t = document.getElementById('highlight-title');
            const d = document.getElementById('highlight-description');
            const p = document.getElementById('highlight-price');
            if (t) t.value = h.title || '';
            if (d) d.value = h.description || '';
            if (p) p.value = h.price != null && h.price !== '' ? h.price : '';
            if (h.image_url && prev) {
                prev.src = h.image_url;
                prev.classList.remove('hidden');
                const hi = document.createElement('input');
                hi.type = 'hidden';
                hi.id = 'highlight-current-image';
                hi.value = h.image_url;
                form.appendChild(hi);
            }
            if (titleEl) titleEl.textContent = 'Editar destaque';
            if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-save"></i> Atualizar destaque';
        } else {
            if (titleEl) titleEl.textContent = 'Novo destaque';
            if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-save"></i> Salvar destaque';
        }
        ui.navigateTo('highlightEdit');
    },

    async deleteStoreHighlight(id) {
        if (!id || !confirm('Excluir este destaque da loja?')) return;
        ui.showLoading(true);
        try {
            await db.deleteStoreHighlight(id);
            ui.showToast('Destaque removido', 'success');
            await auth.loadUser();
            if (auth.currentUser) ui.renderProfile(auth.currentUser);
        } catch (e) {
            ui.showToast(e.message || 'Erro ao excluir destaque', 'error');
        } finally {
            ui.showLoading(false);
        }
    },

    async handleHighlightSubmit() {
        if (!auth.currentUser) return;
        const id = document.getElementById('highlight-edit-id')?.value?.trim();
        const isEdit = !!id;
        const fileInput = document.getElementById('highlight-image');
        const file = fileInput?.files?.[0];
        let imageUrl = document.getElementById('highlight-current-image')?.value;

        if (!isEdit && !file) {
            ui.showToast('Adicione uma imagem', 'warning');
            return;
        }
        if (isEdit && !file && !imageUrl) {
            ui.showToast('Adicione uma imagem', 'warning');
            return;
        }

        if (file) {
            ui.showLoading(true);
            try {
                let toUpload = file;
                try {
                    toUpload = await utils.compressImage(file, 1200, 0.8);
                } catch (_) { /* mantém original */ }
                imageUrl = await db.uploadImage(toUpload, 'promotions', auth.currentUser.id);
            } catch (err) {
                const msg = (err && err.message) ? err.message : String(err);
                ui.showToast('Erro ao enviar imagem: ' + msg, 'error');
                ui.showLoading(false);
                return;
            }
            ui.showLoading(false);
        }

        const title = document.getElementById('highlight-title')?.value?.trim();
        if (!title) {
            ui.showToast('Informe o nome do produto', 'warning');
            return;
        }
        const description = document.getElementById('highlight-description')?.value?.trim() || '';
        const priceRaw = document.getElementById('highlight-price')?.value;
        let price = priceRaw === '' || priceRaw == null ? null : parseFloat(priceRaw);
        if (price != null && Number.isNaN(price)) {
            ui.showToast('Preço inválido', 'warning');
            return;
        }

        ui.showLoading(true);
        try {
            if (isEdit) {
                await db.updateStoreHighlight(id, {
                    title,
                    description,
                    price,
                    image_url: imageUrl
                });
                ui.showToast('Destaque atualizado!', 'success');
            } else {
                await db.createStoreHighlight({
                    merchant_id: auth.currentUser.id,
                    title,
                    description,
                    price,
                    image_url: imageUrl
                });
                ui.showToast('Destaque publicado!', 'success');
            }
            await auth.loadUser();
            ui.navigateTo('profile');
            if (auth.currentUser) ui.renderProfile(auth.currentUser);
        } catch (e) {
            const raw = String(e?.message || e || '');
            const code = e?.code;
            const hlMissing =
                code === '42703' ||
                code === 'PGRST204' ||
                (/(merchant_highlights|destaques_do_comerciante)/i.test(raw) && /does not exist|schema cache|Could not find|não existe/i.test(raw));
            if (hlMissing) {
                ui.showToast(
                    'Execute o SQL de destaques no Supabase e depois rode: NOTIFY pgrst, \'reload schema\'; aguarde ~15s.',
                    'error',
                    8000
                );
            } else if (/permission|RLS|42501|violates row-level security|policy/i.test(raw)) {
                ui.showToast(
                    'Sem permissão para gravar destaques (RLS). Verifique policy UPDATE em ' + (typeof pcUsersTable === 'function' ? pcUsersTable() : 'perfil') + '.',
                    'error',
                    6000
                );
            } else {
                ui.showToast(raw || 'Erro ao salvar destaque', 'error');
            }
        } finally {
            ui.showLoading(false);
        }
    },

    async handlePublish() {
        const publishForm = document.getElementById('publish-form');
        const isEditing = publishForm.dataset.mode === 'edit';
        const promoId = publishForm.dataset.promoId;

        const fileInput = document.getElementById('promo-image');
        const file = fileInput?.files[0];

        let imageUrl;
        if (isEditing && !file) {
            imageUrl = document.getElementById('promo-current-image')?.value;
            if (!imageUrl) {
                ui.showToast('Erro: imagem atual não encontrada', 'error');
                return;
            }
        } else {
            if (!file) {
                ui.showToast('Adicione uma imagem', 'warning');
                return;
            }
            ui.showLoading(true);

            try {
                let fileToUpload = file;
                try {
                    fileToUpload = await utils.compressImage(file, 1200, 0.8);
                } catch (compressErr) {
                    fileToUpload = file;
                }
                imageUrl = await db.uploadImage(fileToUpload, 'promotions', auth.currentUser.id);
            } catch (uploadError) {
                console.error('Erro no upload:', uploadError);
                const msg = (uploadError && uploadError.message) ? uploadError.message : String(uploadError);
                ui.showToast('Erro ao fazer upload da imagem: ' + msg, 'error');
                ui.showLoading(false);
                return;
            }
        }

        const promoData = {
            imageUrl: imageUrl,
            title: document.getElementById('promo-title')?.value || '',
            description: document.getElementById('promo-description')?.value || '',
            oldPrice: parseFloat(document.getElementById('promo-old-price')?.value) || null,
            newPrice: parseFloat(document.getElementById('promo-new-price')?.value) || 0,
            isHot: document.getElementById('promo-hot')?.checked || false,
            expiresAt: document.getElementById('promo-expires')?.value || '',
            category: document.getElementById('promo-category')?.value || auth.currentUser?.profile?.business_category || ''
        };

        if (!promoData.title || !promoData.description || !promoData.newPrice || !promoData.expiresAt || !promoData.category) {
            ui.showToast('Preencha todos os campos obrigatórios', 'warning');
            ui.showLoading(false);
            return;
        }

        ui.showLoading(true);

        try {
            if (isEditing) {
                await db.updatePromotion(promoId, promoData);
                ui.showToast('Promoção atualizada!', 'success');
            } else {
                const created = await db.createPromotion(promoData);
                const authorName = auth.currentUser?.profile?.business_name || auth.currentUser?.profile?.name || 'Uma loja';
                db.notifyUsersAboutNewPromotion(auth.currentUser.id, authorName, promoData.title, created?.id).catch(() => {});
                ui.showToast('Promoção publicada!', 'success');
            }

            publishForm.dataset.mode = '';
            publishForm.dataset.promoId = '';
            const submitBtn = publishForm.querySelector('button[type="submit"]');
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Publicar Promoção';
            publishForm.reset();
            const preview = document.getElementById('image-preview');
            if (preview) preview.classList.add('hidden');

            const hiddenField = document.getElementById('promo-current-image');
            if (hiddenField) hiddenField.remove();

            ui.navigateTo('main');
            await this.loadInitialData();

        } catch (error) {
            console.error('❌ Erro ao publicar/atualizar promoção:', error);
            ui.showToast('Erro ao publicar: ' + error.message, 'error');
        } finally {
            ui.showLoading(false);
        }
    },

    async likePromo(promoId) {
        if (!auth.isAuthenticated()) {
            ui.showToast('Faça login para curtir', 'warning');
            return;
        }

        // Proteção contra clique duplo / race condition
        if (!this._likingInProgress) this._likingInProgress = new Set();
        if (this._likingInProgress.has(String(promoId))) return;
        this._likingInProgress.add(String(promoId));

        // UI otimista: atualiza na hora e reverte se a requisição falhar
        const card = document.querySelector(`[data-id="${promoId}"]`);
        let prevCount = 0;
        let prevLiked = false;
        if (card) {
            const btn = card.querySelector('.action-group .action-btn:first-child');
            if (btn) {
                const span = btn.querySelector('span');
                prevCount = parseInt(span?.textContent || '0', 10) || 0;
                prevLiked = btn.classList.contains('active');
                const newLiked = !prevLiked;
                const newCount = prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1;
                ui.updateLikeCount(promoId, newCount, newLiked);
            }
        }

        try {
            const result = await db.toggleLike(promoId);
            ui.updateLikeCount(promoId, result.likes_count, result.liked);

            // Notifica o comerciante no sino do app quando alguém curte (não quando descurte)
            if (result.liked) {
                const promo = this.state.promotions.find(p => String(p.id) === String(promoId));
                const authorId = promo?.author_id || promo?.author?.id;
                const myId = auth.currentUser?.id;
                const myName = auth.currentUser?.profile?.name || auth.currentUser?.profile?.business_name || 'Alguém';
                // Só notifica se o autor for diferente de quem curtiu
                if (authorId && authorId !== myId) {
                    db.insertNotificationRpc(authorId, {
                        title: '❤️ Nova curtida!',
                        message: `${myName} curtiu sua promoção "${promo?.title || 'sua promoção'}"`,
                        actionUrl: 'promocity://promo/' + promoId,
                        actionLabel: 'Ver promoção'
                    }).catch(() => {});
                }
            }
        } catch (error) {
            console.error('Erro ao curtir:', error);
            ui.updateLikeCount(promoId, prevCount, prevLiked);
            ui.showToast('Erro ao curtir', 'error');
        } finally {
            this._likingInProgress.delete(String(promoId));
        }
    },

    async openComments(promoId) {
        if (!auth.isAuthenticated()) {
            ui.showToast('Faça login para comentar', 'warning');
            return;
        }
        const modal = document.getElementById('comments-modal');
        if (modal) modal.dataset.promoId = String(promoId);
        try {
            const comments = await db.getComments(promoId);
            ui.renderComments(comments);
            ui.showCommentsModal(true);
            setTimeout(() => ui.elements.commentInput?.focus(), 100);
        } catch (error) {
            console.error('Erro ao carregar comentários:', error);
            ui.showToast('Erro ao carregar comentários', 'error');
        }
    },

    async submitComment() {
        // Proteção contra duplo envio
        if (this._commentSubmitting) return;

        const modal = document.getElementById('comments-modal');
        const promoId = modal?.dataset?.promoId;
        if (!promoId) return;
        if (!auth.isAuthenticated()) {
            ui.showToast('Faça login para comentar', 'warning');
            return;
        }
        const input = ui.elements.commentInput;
        const text = input?.value?.trim();
        if (!text) return;

        this._commentSubmitting = true;
        const submitBtn = document.getElementById('comment-submit');
        if (submitBtn) submitBtn.disabled = true;

        try {
            await db.addComment(promoId, text);
            input.value = '';
            const comments = await db.getComments(promoId);
            ui.renderComments(comments);
            const newCount = comments.length;
            ui.updateCommentCountOnCard(promoId, newCount);
            const promo = this.state.promotions?.find(p => String(p.id) === String(promoId));
            if (promo) promo.comments_count = newCount;
        } catch (error) {
            console.error('Erro ao enviar comentário:', error);
            ui.showToast(error?.message || 'Erro ao enviar comentário', 'error');
        } finally {
            this._commentSubmitting = false;
            if (submitBtn) submitBtn.disabled = false;
        }
    },

    async toggleFavorite(promoId) {
        try {
            const result = await db.toggleFavorite(promoId);
            ui.updateFavoriteState(promoId, result.isFavorited);
            ui.showToast(result.isFavorited ? 'Adicionado aos favoritos' : 'Removido dos favoritos', 'success', 1500);
            // Se removeu e está na tela de favoritos, atualiza a lista (remove o card)
            const favoritesScreen = ui.elements.screens && ui.elements.screens.favorites;
            if (!result.isFavorited && ui.elements.favorites && favoritesScreen && !favoritesScreen.classList.contains('hidden')) {
                const card = ui.elements.favorites.querySelector(`[data-id="${promoId}"]`);
                if (card) card.remove();
                if (ui.elements.favorites.children.length === 0) {
                    ui.elements.favorites.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-heart"></i>
                            <p>Nenhum favorito ainda</p>
                            <small>Toque no ícone de favorito nas promoções para adicionar aqui.</small>
                        </div>
                    `;
                }
            }
        } catch (error) {
            ui.showToast('Erro ao atualizar favoritos', 'error');
        }
    },

    async sharePromo(promoId) {
        console.log('🔗 sharePromo chamado com ID:', promoId);
        
        let promo = this.state.promotions.find(p => p.id === promoId);
        
        if (!promo) {
            try {
                const { data, error } = await supabaseClient
                    .from('promotions')
                    .select('*')
                    .eq('id', promoId)
                    .maybeSingle();
                    
                if (error || !data) {
                    ui.showToast('Promoção não encontrada', 'error');
                    return;
                }
                promo = data;
            } catch (error) {
                ui.showToast('Erro ao carregar promoção', 'error');
                return;
            }
        }

        const shareText = `${promo.title} - ${promo.description} por apenas ${utils.formatCurrency(promo.new_price)} no PROMOCITY!`;
        // Usa ?promo=ID para funcionar em hospedagem estática sem rotas de SPA (evita 404)
        const shareUrl = `${window.location.origin}${window.location.pathname}?promo=${promoId}`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: promo.title,
                    text: shareText,
                    url: shareUrl
                });
                return;
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Erro no compartilhamento nativo:', error);
                }
            }
        }

        this.showShareMenu(shareText, shareUrl, promo.image_url);
    },

    showShareMenu(text, url, imageUrl) {
        const menu = document.getElementById('share-menu');
        if (!menu) return;

        const newMenu = menu.cloneNode(true);
        menu.parentNode.replaceChild(newMenu, menu);
        newMenu.id = 'share-menu';

        const encodedText = encodeURIComponent(text);
        const encodedUrl = encodeURIComponent(url);

        const networks = {
            whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
            facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
            twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
            telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
            copy: () => {
                this.copyToClipboard(url);
                ui.showToast('Link copiado!', 'success');
                newMenu.classList.add('hidden');
            }
        };

        newMenu.querySelectorAll('.share-menu-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const network = btn.dataset.network;
                if (network === 'copy') {
                    networks.copy();
                } else if (networks[network]) {
                    window.open(networks[network], '_blank', 'width=600,height=400');
                    newMenu.classList.add('hidden');
                }
            });
        });

        const closeMenu = (e) => {
            if (!newMenu.contains(e.target)) {
                newMenu.classList.add('hidden');
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 100);

        newMenu.classList.remove('hidden');
    },

    copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
    },

    async viewAuthorStories(authorId) {
        const authorStories = this.state.stories.filter(s => String(s.author?.id) === String(authorId));
        if (authorStories.length > 0) {
            // Monta lista de grupos para navegação entre vitrines
            const grouped = ui.groupStoriesByAuthor(this.state.stories);
            const currentGroupIndex = grouped.findIndex(g => String(g.author.id) === String(authorId));

            let onNextGroup = null;
            let onPrevGroup = null;

            if (currentGroupIndex < grouped.length - 1) {
                onNextGroup = () => {
                    this.viewAuthorStories(grouped[currentGroupIndex + 1].author.id);
                };
            }

            if (currentGroupIndex > 0) {
                onPrevGroup = () => {
                    this.viewAuthorStories(grouped[currentGroupIndex - 1].author.id);
                };
            }

            ui.renderStorySequence(authorStories, onNextGroup, onPrevGroup);
        } else {
            console.warn('Nenhum story encontrado para o autor', authorId);
        }
    },

    async logout() {
        ui.showLoading(true);
        const result = await auth.logout();
        ui.showLoading(false);

        if (result.success) {
            ui.navigateTo('login');
        } else {
            ui.showToast(result.error, 'error');
        }
    },

    async loadFavorites() {
        try {
            const favorites = await db.getFavorites();
            const ids = (favorites || []).map(p => p.id);
            let counts = {};
            try { if (ids.length) counts = await db.getCommentCounts(ids); } catch (_) {}
            favorites.forEach(p => { p.comments_count = counts[p.id] ?? 0; });
            ui.renderFeed(favorites, ui.elements.favorites);
        } catch (error) {
            ui.showToast('Erro ao carregar favoritos', 'error');
        }
    },

    async loadProfile() {
        this.closeProfileActionsMenu();
        if (auth.currentUser) {
            await auth.loadUser();
            if (auth.currentUser) {
                ui.renderProfile(auth.currentUser);
            }
        }
        this.updateHeaderAvatar();
    },

    /**
     * Atualiza a foto do perfil no header da tela principal
     */
    updateHeaderAvatar() {
        const img = document.getElementById('header-avatar-img');
        if (!img) return;
        const avatarUrl = auth.currentUser?.profile?.avatar_url;
        if (avatarUrl) {
            img.src = avatarUrl;
            img.alt = 'Perfil';
            img.classList.remove('hidden');
        } else {
            img.removeAttribute('src');
            img.classList.add('hidden');
        }
    },

    async editProfile() {
        if (!auth.currentUser) return;

        await auth.loadUser();
        const user = auth.currentUser;

        ui.renderEditProfile(user);
        ui.navigateTo('editProfile');
    },

    async saveProfile(updatedData) {
        if (!auth.currentUser) return;

        ui.showLoading(true);

        try {
            if (auth.currentUser.profile.user_type === 'merchant' && updatedData.business_address) {
                const oldAddress = auth.currentUser.profile.business_address;
                
                if (oldAddress !== updatedData.business_address) {
                    ui.showToast('Obtendo coordenadas do endereço...', 'info', 2000);
                    
                    console.log('📍 Geocodificando endereço:', updatedData.business_address);
                    
                    const coords = await utils.geocodeAddress(updatedData.business_address);
                    
                    if (coords) {
                        updatedData.latitude = coords.lat;
                        updatedData.longitude = coords.lon;
                        console.log('✅ Coordenadas obtidas:', coords);
                        ui.showToast('Localização encontrada!', 'success', 1500);
                    } else {
                        console.warn('⚠️ Falha na geocodificação para:', updatedData.business_address);
                        ui.showToast('Não foi possível encontrar o endereço no mapa. Verifique se está completo.', 'warning');
                    }
                } else {
                    console.log('ℹ️ Endereço não alterado, mantendo coordenadas existentes');
                }
            }

            await db.updateUserProfile(auth.currentUser.id, updatedData);
            await auth.loadUser();

            ui.showToast('Perfil atualizado com sucesso!', 'success');
            this.updateHeaderAvatar();
            ui.navigateTo('profile');
            this.loadProfile();

        } catch (error) {
            console.error('❌ Erro ao salvar perfil:', error);
            ui.showToast('Erro ao salvar: ' + error.message, 'error');
        } finally {
            ui.showLoading(false);
        }
    },

    async loadProfileByAuthor(authorId) {
        this.closeProfileActionsMenu();
        ui.showLoading(true);
        try {
            const authorData = await auth.loadProfileByAuthor(authorId);
            if (authorData) {
                const tempUser = {
                    id: authorData.id,
                    profile: authorData
                };
                ui.renderProfile(tempUser);
                ui.navigateTo('profile');
            } else {
                ui.showToast('Perfil não encontrado', 'error');
            }
        } catch (error) {
            console.error('Erro ao carregar perfil do autor:', error);
            ui.showToast('Erro ao carregar perfil', 'error');
        } finally {
            ui.showLoading(false);
        }
    },

    /**
     * Autocomplete de comércios na tela de busca (perfis na tabela users, sem depender de produtos).
     */
    setupMerchantSearchAutocomplete() {
        const input = document.getElementById('search-input');
        const dropdown = document.getElementById('merchant-search-dropdown');
        const wrap = document.querySelector('.merchant-search-field-wrap');
        if (!input || !dropdown || !wrap || typeof db.searchMerchantProfiles !== 'function') return;

        let reqId = 0;

        const setDropdownOpen = (open) => {
            if (open) {
                dropdown.classList.add('is-open');
                input.setAttribute('aria-expanded', 'true');
            } else {
                dropdown.classList.remove('is-open');
                input.setAttribute('aria-expanded', 'false');
                dropdown.innerHTML = '';
            }
        };

        const merchantDisplayName = (row) => {
            const bn = (row.business_name || '').trim();
            const n = (row.name || '').trim();
            return bn || n || 'Comércio';
        };

        const highlightMatch = (text, query) => {
            const t = utils.escapeHTML(String(text ?? ''));
            const q = String(query || '').trim();
            if (!q) return t;
            const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`(${esc})`, 'gi');
            return t.replace(re, '<mark class="merchant-search-highlight">$1</mark>');
        };

        const renderMerchantRows = (merchants, query) => {
            if (!merchants.length) {
                dropdown.innerHTML = '<div class="merchant-search-empty" role="option">Nenhum comércio encontrado</div>';
                setDropdownOpen(true);
                return;
            }

            const html = merchants.map((row) => {
                const name = merchantDisplayName(row);
                const idAttr = utils.escapeHTML(String(row.id));
                const imgUrl = row.avatar_url ? utils.sanitizeUrl(row.avatar_url) : '';
                const imgBlock = imgUrl
                    ? `<img src="${imgUrl}" alt="" class="merchant-search-avatar-img" loading="lazy">`
                    : '<div class="merchant-search-avatar-fallback" aria-hidden="true"><i class="fas fa-store"></i></div>';
                return `<button type="button" class="merchant-search-item" role="option" data-merchant-id="${idAttr}">
                    <div class="merchant-search-avatar">${imgBlock}</div>
                    <div class="merchant-search-item-text">${highlightMatch(name, query)}</div>
                </button>`;
            }).join('');

            dropdown.innerHTML = html;
            dropdown.querySelectorAll('.merchant-search-item').forEach((btn) => {
                btn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    const id = btn.getAttribute('data-merchant-id');
                    setDropdownOpen(false);
                    if (id) this.loadProfileByAuthor(id);
                });
            });
            setDropdownOpen(true);
        };

        const runMerchantSearch = async (rawQuery) => {
            const q = String(rawQuery || '').trim();
            if (!q) {
                reqId++;
                setDropdownOpen(false);
                return;
            }
            const id = ++reqId;
            try {
                const list = await db.searchMerchantProfiles(q, { limit: 40 });
                if (id !== reqId) return;
                renderMerchantRows(list, q);
            } catch (err) {
                if (id !== reqId) return;
                console.warn('Busca de comércios:', err);
                dropdown.innerHTML = '<div class="merchant-search-empty" role="option">Nenhum comércio encontrado</div>';
                setDropdownOpen(true);
            }
        };

        const debouncedMerchant = utils.debounce((e) => {
            runMerchantSearch(e.target.value);
        }, 300);

        input.addEventListener('input', debouncedMerchant);

        input.addEventListener('focus', () => {
            const v = input.value.trim();
            if (v) runMerchantSearch(v);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') setDropdownOpen(false);
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.classList.contains('is-open')) return;
            if (wrap.contains(e.target)) return;
            setDropdownOpen(false);
        });
    },

    // ==================== FUNÇÃO: TORNAR-SE COMERCIANTE ====================
    async upgradeToMerchant() {
        if (!auth.isAuthenticated()) {
            ui.showToast('Faça login primeiro', 'warning');
            return;
        }

        if (auth.isMerchant()) {
            ui.showToast('Você já é um comerciante', 'info');
            return;
        }

        if (!confirm('Deseja se tornar um comerciante? Você poderá publicar promoções e stories.')) {
            return;
        }

        ui.showLoading(true);

        try {
            const { error } = await supabaseClient
                .from(pcUsersTable())
                .update({ user_type: 'merchant' })
                .eq((typeof pcProfileAuthColumn === 'function' ? pcProfileAuthColumn() : 'id'), auth.currentUser.id);

            if (error) throw error;

            await auth.loadUser();
            ui.showToast('Agora você é um comerciante!', 'success');
            
            const addMenuBtn = document.getElementById('btn-add-menu');
            if (addMenuBtn) {
                addMenuBtn.style.display = 'flex';
            }
            
            ui.navigateTo('profile');
            this.loadProfile();

        } catch (error) {
            console.error('❌ Erro ao atualizar para comerciante:', error);
            ui.showToast('Erro ao atualizar perfil', 'error');
        } finally {
            ui.showLoading(false);
        }
    },

    // ==================== FUNÇÃO: VOLTAR A SER CONSUMIDOR ====================
    async downgradeToConsumer() {
        if (!auth.isAuthenticated()) {
            ui.showToast('Faça login primeiro', 'warning');
            return;
        }

        if (!auth.isMerchant()) {
            ui.showToast('Você já é um consumidor', 'info');
            return;
        }

        if (!confirm('Tem certeza que deseja voltar a ser consumidor? Você perderá acesso às funções de publicação e seus anúncios serão desativados.')) {
            return;
        }

        ui.showLoading(true);

        try {
            const { error } = await supabaseClient
                .from(pcUsersTable())
                .update({ user_type: 'consumer' })
                .eq((typeof pcProfileAuthColumn === 'function' ? pcProfileAuthColumn() : 'id'), auth.currentUser.id);

            if (error) throw error;

            await auth.loadUser();
            ui.showToast('Agora você é um consumidor', 'success');
            
            const addMenuBtn = document.getElementById('btn-add-menu');
            if (addMenuBtn) {
                addMenuBtn.style.display = 'none';
            }
            
            ui.navigateTo('profile');
            this.loadProfile();

        } catch (error) {
            console.error('❌ Erro ao voltar para consumidor:', error);
            ui.showToast('Erro ao atualizar perfil', 'error');
        } finally {
            ui.showLoading(false);
        }
    },

    // ==================== ENTREGAS E MOTOBOYS ====================

    captureGPSLocation() {
        if (!navigator.geolocation) {
            ui.showToast('Geolocalização não disponível neste dispositivo', 'error');
            return;
        }
        const previewEl = document.getElementById('gps-location-preview');
        const manualEl  = document.getElementById('manual-address-input');
        const addrSpan  = document.getElementById('gps-preview-address');
        const mapsLink  = document.getElementById('gps-preview-link');

        if (addrSpan) addrSpan.textContent = 'Obtendo localização...';
        previewEl?.classList.remove('hidden');
        manualEl?.classList.add('hidden');

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                this.state.deliveryRequestLat = lat;
                this.state.deliveryRequestLng = lng;

                const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
                if (mapsLink) { mapsLink.href = mapsUrl; }

                // Tenta geocodificação reversa para mostrar nome da rua
                if (addrSpan) addrSpan.textContent = 'Localizando endereço...';
                try {
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt-BR`,
                        { headers: { 'Accept-Language': 'pt-BR' } }
                    );
                    const data = await res.json();
                    const short = [
                        data?.address?.road,
                        data?.address?.house_number,
                        data?.address?.suburb || data?.address?.neighbourhood,
                        data?.address?.city || data?.address?.town || data?.address?.village
                    ].filter(Boolean).join(', ')
                        || data?.display_name?.split(',').slice(0, 3).join(',').trim()
                        || 'Localização obtida';
                    if (addrSpan) addrSpan.textContent = short;
                    this.state.deliveryGPSAddress = short;
                } catch (_) {
                    // Se a geocodificação falhar, mostra texto amigável em vez de coordenadas
                    if (addrSpan) addrSpan.textContent = 'Localização obtida (ver no mapa)';
                    this.state.deliveryGPSAddress = 'Localização obtida';
                }

                this.recalcDeliveryFee();
                ui.showToast('Localização capturada!', 'success');
            },
            (err) => {
                previewEl?.classList.add('hidden');
                const msg = err.code === 1
                    ? 'Permissão de localização negada. Ative o GPS e tente novamente.'
                    : 'Não foi possível obter sua localização.';
                ui.showToast(msg, 'error');
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    },

    async loadMerchantOtherPromos(merchantId, excludePromoId) {
        try {
            const now = new Date().toISOString();
            const { data: promosData, error } = await supabaseClient
                .from('promotions')
                .select('id, title, new_price, old_price, image_url')
                .eq('author_id', merchantId)
                .neq('id', excludePromoId)
                .gt('expires_at', now)
                .order('created_at', { ascending: false });
            if (error || !promosData) return;

            let highlightsData = [];
            try {
                highlightsData = await db.getStoreHighlights(merchantId);
            } catch (_) {
                highlightsData = [];
            }

            const promos = (promosData || []).map((p) => ({
                ...p,
                extraType: 'promotion',
                new_price: parseFloat(p.new_price),
                canAdd: Number.isFinite(parseFloat(p.new_price))
            }));

            const highlights = (highlightsData || []).map((h) => {
                const parsedPrice = parseFloat(h.price);
                return {
                    id: h.id,
                    title: h.title,
                    image_url: h.image_url || null,
                    new_price: Number.isFinite(parsedPrice) ? parsedPrice : null,
                    old_price: null,
                    extraType: 'highlight',
                    canAdd: Number.isFinite(parsedPrice)
                };
            });

            this.state.merchantOtherPromos = [...promos, ...highlights];
            ui.renderMerchantOtherPromos(this.state.merchantOtherPromos, this.state.deliveryItems);
        } catch (_) {}
    },

    // Inicializa a lista de itens com o produto principal
    initDeliveryItems(promo) {
        this.state.deliveryItems = [{
            name: promo.title,
            qty: 1,
            unitPrice: parseFloat(promo.new_price) || 0,
            isMain: true
        }];
        ui.renderOrderItemsList(this.state.deliveryItems, (idx) => this.removeDeliveryItem(idx));
        this.recalcDeliveryFee();
    },

    addExtraDeliveryItem(promo) {
        const sourceType = promo?.extraType === 'highlight' ? 'highlight' : 'promotion';
        const sourceId = promo?.id;
        if (!sourceId) return;
        const parsedPrice = parseFloat(promo.new_price);
        const canAdd = promo?.canAdd !== false && Number.isFinite(parsedPrice) && parsedPrice > 0;
        if (!canAdd) {
            ui.showToast('Este item está sem preço no momento (sob consulta).', 'warning');
            return;
        }
        const extraKey = `${sourceType}:${sourceId}`;

        // Verifica se já está na lista
        const alreadyIdx = this.state.deliveryItems.findIndex(i => String(i.extraKey || i.promoId) === String(extraKey));
        if (alreadyIdx !== -1) {
            // Já existe: incrementa quantidade
            this.state.deliveryItems[alreadyIdx].qty += 1;
        } else {
            this.state.deliveryItems.push({
                name: promo.title,
                qty: 1,
                unitPrice: parsedPrice,
                isMain: false,
                promoId: extraKey,
                extraKey: extraKey,
                sourceType: sourceType
            });
        }
        ui.renderOrderItemsList(this.state.deliveryItems, (idx) => this.removeDeliveryItem(idx));
        ui.renderMerchantOtherPromos(this.state.merchantOtherPromos, this.state.deliveryItems);
        this.recalcDeliveryFee();
    },

    updateMainItemQty(qty) {
        if (!this.state.deliveryItems.length) return;
        this.state.deliveryItems[0].qty = Math.max(1, parseInt(qty) || 1);
        ui.renderOrderItemsList(this.state.deliveryItems, (idx) => this.removeDeliveryItem(idx));
        this.recalcDeliveryFee();
    },

    removeDeliveryItem(index) {
        if (index === 0) return; // item principal não pode ser removido
        this.state.deliveryItems.splice(index, 1);
        ui.renderOrderItemsList(this.state.deliveryItems, (idx) => this.removeDeliveryItem(idx));
        ui.renderMerchantOtherPromos(this.state.merchantOtherPromos, this.state.deliveryItems);
        this.recalcDeliveryFee();
    },

    removeOneExtraDeliveryItem(promoId) {
        const idx = this.state.deliveryItems.findIndex(i => String(i.extraKey || i.promoId) === String(promoId));
        if (idx === -1) return;
        this.state.deliveryItems[idx].qty -= 1;
        if (this.state.deliveryItems[idx].qty <= 0) {
            this.state.deliveryItems.splice(idx, 1);
        }
        ui.renderOrderItemsList(this.state.deliveryItems, (i) => this.removeDeliveryItem(i));
        ui.renderMerchantOtherPromos(this.state.merchantOtherPromos, this.state.deliveryItems);
        this.recalcDeliveryFee();
    },

    getDeliveryItemsTotal() {
        return this.state.deliveryItems.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);
    },

    buildItemsNotesPrefix() {
        if (this.state.deliveryItems.length <= 1 && this.state.deliveryItems[0]?.qty === 1) return '';
        const lines = this.state.deliveryItems.map(item =>
            `${item.qty}x ${item.name} (${utils.formatCurrency(item.qty * item.unitPrice)})`
        );
        return `--- Itens do pedido ---\n${lines.join('\n')}\n-----------------------\n`;
    },

    async openDeliveryRequest(promoId) {
        if (!auth.isAuthenticated()) {
            ui.showToast('Faça login para pedir com entrega', 'warning');
            ui.navigateTo('login');
            return;
        }
        let promo = this.state.promotions.find(p => String(p.id) === String(promoId));
        if (!promo) {
            ui.showLoading(true);
            try {
                const { data, error } = await supabaseClient
                    .from('promotions')
                    .select(`
                        *,
                        author:users(id, name, business_name, phone, business_address, latitude, longitude)
                    `)
                    .eq('id', promoId)
                    .maybeSingle();
                if (error) throw error;
                if (!data) {
                    ui.showToast('Promoção não encontrada', 'error');
                    return;
                }
                promo = data;
            } catch (e) {
                ui.showToast('Erro ao carregar promoção', 'error');
                return;
            } finally {
                ui.showLoading(false);
            }
        }
        if (auth.currentUser.id === promo.author?.id) {
            ui.showToast('Você não pode pedir entrega da sua própria promoção', 'warning');
            return;
        }
        this.state.deliveryRequestPromo = promo;
        this.state.deliveryRequestLat = null;
        this.state.deliveryRequestLng = null;
        this.state.merchantOtherPromos = [];
        ui.renderDeliveryRequestScreen(promo, promo.author);
        ui.navigateTo('delivery-request');
        this.initDeliveryItems(promo);
        // Busca outras promoções ativas do mesmo comerciante em background
        this.loadMerchantOtherPromos(promo.author_id, promo.id);
    },

    async confirmDeliveryRequest() {
        const promo = this.state.deliveryRequestPromo;
        if (!promo) return;
        const deliveryLat = this.state.deliveryRequestLat;
        const deliveryLng = this.state.deliveryRequestLng;
        const usingGPS = deliveryLat != null && deliveryLng != null;

        // Monta o endereço: GPS gera link do Maps + nome da rua; manual usa o input
        let address;
        if (usingGPS) {
            const mapsUrl = `https://maps.google.com/?q=${deliveryLat},${deliveryLng}`;
            const gpsLabel = this.state.deliveryGPSAddress || `${deliveryLat.toFixed(5)}, ${deliveryLng.toFixed(5)}`;
            address = `📍 ${gpsLabel} — ${mapsUrl}`;
        } else {
            address = document.getElementById('delivery-address')?.value?.trim();
        }

        const clientName = document.getElementById('delivery-client-name')?.value?.trim();
        const clientPhone = document.getElementById('delivery-client-phone')?.value?.trim();
        const paymentMethod = document.querySelector('input[name="payment_method"]:checked')?.value || null;
        const changeForRaw = document.getElementById('delivery-change-for')?.value;
        const changeFor = paymentMethod === 'dinheiro' && changeForRaw ? parseFloat(changeForRaw) : null;
        if (!address || !clientName || !clientPhone) {
            if (!address) ui.showToast('Defina o local de entrega (GPS ou endereço)', 'warning');
            else ui.showToast('Preencha nome e telefone', 'warning');
            return;
        }
        if (!paymentMethod) {
            ui.showToast('Selecione a forma de pagamento', 'warning');
            return;
        }
        const pickupLat = promo.author?.latitude || null;
        const pickupLng = promo.author?.longitude || null;
        const km = (pickupLat != null && pickupLng != null && deliveryLat != null && deliveryLng != null)
            ? utils.getDistanceKm(pickupLat, pickupLng, deliveryLat, deliveryLng)
            : 3;
        const promoTotal = this.getDeliveryItemsTotal();
        const deliveryFee = utils.calculateDeliveryFee(km);
        const totalWithFee = promoTotal + deliveryFee;

        // Monta prefixo com lista de itens para o campo de observações
        const itemsPrefix = this.buildItemsNotesPrefix();
        const userNotes = document.getElementById('delivery-notes')?.value?.trim() || '';
        const fullNotes = itemsPrefix ? (itemsPrefix + (userNotes ? userNotes : '')).trim() : (userNotes || null);

        ui.showLoading(true);
        try {
            await db.createDelivery({
                promotionId: promo.id,
                merchantId: promo.author_id,
                pickupAddress: promo.author?.business_address || 'Retirar no estabelecimento',
                pickupLat, pickupLng,
                deliveryAddress: address,
                deliveryLat, deliveryLng,
                deliveryFee,
                promoTotal,
                total: totalWithFee,
                clientPhone,
                clientName,
                notes: fullNotes,
                paymentMethod,
                changeFor
            });

            // Notifica o comerciante sobre o novo pedido
            try { await db.notifyMerchantAboutNewDelivery(promo.author_id, clientName, promo.title); } catch (_) {}

            ui.showToast('Pedido enviado! O comerciante irá responder.', 'success');
            this.state.deliveryRequestPromo = null;
            this.state.deliveryRequestLat = null;
            this.state.deliveryRequestLng = null;
            this.state.deliveryGPSAddress = null;
            this.state.deliveryItems = [];
            this.state.merchantOtherPromos = [];
            ui.navigateTo('main');
        } catch (e) {
            ui.showToast(e.message || 'Erro ao criar pedido', 'error');
        } finally {
            ui.showLoading(false);
        }
    },

    recalcDeliveryFee() {
        const promo = this.state.deliveryRequestPromo;
        if (!promo) return;
        const pickupLat = promo.author?.latitude || null;
        const pickupLng = promo.author?.longitude || null;
        const deliveryLat = this.state.deliveryRequestLat;
        const deliveryLng = this.state.deliveryRequestLng;
        const hasCoords = pickupLat != null && pickupLng != null && deliveryLat != null && deliveryLng != null;
        const km = hasCoords
            ? utils.getDistanceKm(pickupLat, pickupLng, deliveryLat, deliveryLng)
            : null;
        const itemsTotal = this.getDeliveryItemsTotal();
        const deliveryFee = utils.calculateDeliveryFee(km ?? 3);
        const total = itemsTotal + deliveryFee;
        ui.updateDeliveryFeeSummary(itemsTotal, deliveryFee, total, km);
    },

    openMotoboyVehicleModal() {
        document.getElementById('motoboy-vehicle-modal')?.classList.remove('hidden');
    },

    async confirmMotoboyActivation(vehicle) {
        document.getElementById('motoboy-vehicle-modal')?.classList.add('hidden');
        if (!vehicle) return;
        ui.showLoading(true);
        try {
            await db.updateUserProfile(auth.currentUser.id, {
                is_motoboy: true,
                motoboy_vehicle: vehicle,
                motoboy_available: false
            });
            await auth.loadUser();
            ui.showToast('Agora você é motoboy! Ative "Disponível para entregas" no perfil.', 'success');
            ui.navigateTo('profile');
            this.loadProfile();
        } catch (e) {
            ui.showToast(e.message || 'Erro ao ativar', 'error');
        } finally {
            ui.showLoading(false);
        }
    },

    async deactivateMotoboy() {
        if (!confirm('Parar de ser motoboy? Você não receberá mais entregas.')) return;
        ui.showLoading(true);
        try {
            await db.updateUserProfile(auth.currentUser.id, {
                is_motoboy: false,
                motoboy_vehicle: null,
                motoboy_available: false,
                motoboy_lat: null,
                motoboy_lng: null
            });
            await auth.loadUser();
            ui.showToast('Você não é mais motoboy', 'success');
            ui.navigateTo('profile');
            this.loadProfile();
        } catch (e) {
            ui.showToast(e.message || 'Erro', 'error');
        } finally {
            ui.showLoading(false);
        }
    },

    async toggleMotoboyAvailable(checked) {
        try {
            await db.updateUserProfile(auth.currentUser.id, { motoboy_available: !!checked });
            await auth.loadUser();
        } catch (e) {
            ui.showToast(e.message || 'Erro ao atualizar', 'error');
        }
    },

    async openMotoboyDashboard() {
        ui.navigateTo('motoboy-dashboard');
        await this.loadMotoboyDashboard();
    },

    async loadMotoboyDashboard() {
        ui.showLoading(true);
        try {
            const { inProgress, history, all } = await db.getDeliveriesForMotoboy();
            const available = await db.getDeliveriesAvailableForMotoboy();
            ui.renderMotoboyAvailable(available);
            ui.renderMotoboyInProgress(inProgress);
            ui.renderMotoboyHistory(history);
        } catch (e) {
            ui.showToast(e.message || 'Erro ao carregar entregas', 'error');
        } finally {
            ui.showLoading(false);
        }
    },

    openMyDeliveries() {
        ui.navigateTo('my-deliveries');
        this.loadMyDeliveries();
    },

    async loadMyDeliveries() {
        ui.showLoading(true);
        try {
            const list = await db.getDeliveriesForClient();
            ui.renderMyDeliveries(list);
        } catch (e) {
            ui.showToast(e.message || 'Erro ao carregar pedidos', 'error');
        } finally {
            ui.showLoading(false);
        }
    },

    openMerchantOrders() {
        ui.navigateTo('merchant-orders');
        this.loadMerchantOrders();
    },

    async loadMerchantOrders() {
        ui.showLoading(true);
        try {
            const list = await db.getDeliveriesForMerchant();
            ui.renderMerchantOrders(list);
        } catch (e) {
            ui.showToast(e.message || 'Erro ao carregar pedidos', 'error');
        } finally {
            ui.showLoading(false);
        }
    },

    async acceptDeliveryAsMotoboy(deliveryId) {
        ui.showLoading(true);
        try {
            const updated = await db.assignMotoboyToDelivery(deliveryId);
            ui.showToast('Entrega aceita! Vá até o comerciante.', 'success');
            try {
                const full = await db.getDeliveryById(updated.id);
                const feeStr = utils.formatCurrency(parseFloat(full?.delivery_fee || 0));
                if (full?.merchant_id) {
                    await db.insertNotificationRpc(full.merchant_id, {
                        title: 'Motoboy aceitou a entrega',
                        message: `Um motoboy aceitou o pedido. Taxa de entrega: ${feeStr}.`,
                        actionUrl: 'promocity://merchant-orders',
                        actionLabel: 'Ver pedidos'
                    });
                }
                if (full?.client_id) {
                    await db.insertNotificationRpc(full.client_id, {
                        title: '🛵 Motoboy a caminho!',
                        message: `Seu pedido foi aceito. Taxa de entrega: ${feeStr}. Acompanhe pelo app.`,
                        actionUrl: 'promocity://my-deliveries',
                        actionLabel: 'Ver pedido'
                    });
                }
            } catch (_) {}
            this.state.currentDeliveryId = deliveryId;
            await this.loadMotoboyDashboard();
            this.openDeliveryDetail(deliveryId);
        } catch (e) {
            ui.showToast(e.message || 'Erro ao aceitar', 'error');
        } finally {
            ui.showLoading(false);
        }
    },

    async merchantAcceptDelivery(deliveryId) {
        ui.showLoading(true);
        try {
            const updated = await db.updateDeliveryMerchantDecision(deliveryId, true);
            ui.showToast('Pedido aceito. Aguardando motoboy.', 'success');
            // Notifica cliente (in-app)
            try {
                if (updated?.client_id) {
                    await db.insertNotificationRpc(updated.client_id, {
                        title: 'Pedido aceito',
                        message: 'O comerciante aceitou seu pedido. Aguardando motoboy.',
                        actionUrl: 'promocity://my-deliveries',
                        actionLabel: 'Ver pedido'
                    });
                }
                // Notifica motoboys disponíveis que há uma nova entrega
                await db.notifyAvailableMotoboys();
            } catch (_) {}
            this.loadMerchantOrders();
        } catch (e) {
            ui.showToast(e.message || 'Erro', 'error');
        } finally {
            ui.showLoading(false);
        }
    },

    async merchantRejectDelivery(deliveryId) {
        ui.showLoading(true);
        try {
            const updated = await db.updateDeliveryMerchantDecision(deliveryId, false);
            ui.showToast('Pedido recusado.', 'info');
            // Notifica cliente (in-app)
            try {
                if (updated?.client_id) {
                    await db.insertNotificationRpc(updated.client_id, {
                        title: 'Pedido recusado',
                        message: 'O comerciante recusou seu pedido de entrega.',
                        actionUrl: 'promocity://my-deliveries',
                        actionLabel: 'Ver pedido'
                    });
                }
            } catch (_) {}
            this.loadMerchantOrders();
        } catch (e) {
            ui.showToast(e.message || 'Erro', 'error');
        } finally {
            ui.showLoading(false);
        }
    },

    openDeliveryTracking(deliveryId) {
        this.state.currentDeliveryId = deliveryId;
        ui.navigateTo('delivery-tracking');
        this.loadDeliveryTracking(deliveryId);
    },

    async loadDeliveryTracking(deliveryId) {
        try {
            const delivery = await db.getDeliveryById(deliveryId);
            const locations = await db.getDeliveryLocations(deliveryId);
            ui.renderDeliveryTracking(delivery, locations);
            if (window.mapManager && document.getElementById('delivery-tracking-map')) {
                mapManager.initDeliveryTrackingMap(delivery, locations);
            }
        } catch (e) {
            ui.showToast(e.message || 'Erro ao carregar', 'error');
        }
    },

    async openDeliveryDetail(deliveryId) {
        this.state.currentDeliveryId = deliveryId;
        ui.navigateTo('delivery-detail');
        try {
            const delivery = await db.getDeliveryById(deliveryId);
            ui.renderDeliveryDetail(delivery);
            const btnShare = document.getElementById('btn-share-location');
            if (btnShare) {
                btnShare.onclick = () => this.startDeliveryLocationShare();
            }
        } catch (e) {
            ui.showToast(e.message || 'Erro ao carregar', 'error');
        }
    },

    async updateDeliveryStatusAndRefresh(status) {
        const id = this.state.currentDeliveryId;
        if (!id) return;
        ui.showLoading(true);
        try {
            await db.updateDeliveryStatus(id, status);
            ui.showToast('Status atualizado', 'success');
            const delivery = await db.getDeliveryById(id);
            ui.renderDeliveryDetail(delivery);
            // Notifica cliente e comerciante (in-app) sobre status
            try {
                const statusMsg = {
                    picked_up: 'Motoboy saiu para entrega.',
                    in_delivery: 'Motoboy está a caminho do cliente.',
                    delivered: 'Pedido entregue!'
                }[status] || ('Status atualizado: ' + status);
                if (delivery?.client_id) {
                    await db.insertNotificationRpc(delivery.client_id, {
                        title: 'Atualização do pedido',
                        message: statusMsg,
                        actionUrl: 'promocity://my-deliveries',
                        actionLabel: 'Acompanhar'
                    });
                }
                if (delivery?.merchant_id) {
                    await db.insertNotificationRpc(delivery.merchant_id, {
                        title: 'Atualização da entrega',
                        message: statusMsg,
                        actionUrl: 'promocity://merchant-orders',
                        actionLabel: 'Ver pedidos'
                    });
                }
            } catch (_) {}
            if (status === 'delivered') {
                this.state.currentDeliveryId = null;
                this.stopDeliveryLocationShare();
                setTimeout(() => {
                    ui.navigateTo('motoboy-dashboard');
                    this.loadMotoboyDashboard();
                }, 1500);
            }
        } catch (e) {
            ui.showToast(e.message || 'Erro', 'error');
        } finally {
            ui.showLoading(false);
        }
    },

    startDeliveryLocationShare() {
        if (!navigator.geolocation) {
            ui.showToast('Geolocalização não disponível', 'error');
            return;
        }
        const deliveryId = this.state.currentDeliveryId;
        if (!deliveryId) return;
        this.stopDeliveryLocationShare();
        this.state.deliveryLocationWatchId = navigator.geolocation.watchPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                try {
                    await db.insertDeliveryLocation(deliveryId, lat, lng);
                    await db.updateMotoboyLocation(lat, lng);
                } catch (_) {}
            },
            () => {},
            { enableHighAccuracy: true, maximumAge: 10000 }
        );
        ui.showToast('Compartilhando localização...', 'success');
    },

    stopDeliveryLocationShare() {
        if (this.state.deliveryLocationWatchId != null) {
            navigator.geolocation.clearWatch(this.state.deliveryLocationWatchId);
            this.state.deliveryLocationWatchId = null;
        }
    },

    // ==================== FUNÇÕES DO MAPA ====================
    openMap() {
        ui.navigateTo('map');
        
        setTimeout(() => {
            mapManager.init();
            this.loadMapPromotions();
        }, 200);
    },

    async loadMapPromotions() {
        try {
            ui.showLoading(true);
            const promotions = await db.getPromotionsForMap({ limit: 50 });
            console.log('🗺️ Promoções carregadas para o mapa:', promotions.length);
            mapManager.addPromotionMarkers(promotions);
        } catch (error) {
            console.error('❌ Erro ao carregar promoções para o mapa:', error);
            ui.showToast('Erro ao carregar promoções no mapa', 'error');
        } finally {
            ui.showLoading(false);
        }
    },

    openWhatsApp(phone, promoTitle) {
        if (!phone) {
            ui.showToast('Número de WhatsApp não disponível', 'warning');
            return;
        }
        
        let cleanNumber = phone.replace(/\D/g, '');
        
        if (cleanNumber.length === 10 || cleanNumber.length === 11) {
            cleanNumber = '55' + cleanNumber;
        }
        
        const message = encodeURIComponent(`Olá! Vi sua promoção "${promoTitle}" no PROMOCITY e me interessei. Ainda está disponível?`);
        const whatsappUrl = `https://wa.me/${cleanNumber}?text=${message}`;
        
        window.open(whatsappUrl, '_blank');
    },

    openPromoFromMap(promoId) {
        ui.navigateTo('main');
        
        setTimeout(() => {
            const promoElement = document.querySelector(`[data-id="${promoId}"]`);
            if (promoElement) {
                promoElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                promoElement.style.backgroundColor = '#f0f7ff';
                promoElement.style.transition = 'background-color 0.5s';
                setTimeout(() => {
                    promoElement.style.backgroundColor = '';
                }, 2000);
            } else {
                ui.showToast('Promoção não encontrada no feed', 'warning');
            }
        }, 300);
    },

    /**
     * Integra botão físico "voltar" do celular com a navegação interna.
     * Fecha modais/story primeiro; depois volta à tela anterior; na tela
     * principal mantém o app aberto sem fechar.
     */
    setupHistoryNavigation() {
        window.addEventListener('popstate', (e) => {
            const storyViewer = document.getElementById('story-viewer');
            if (storyViewer && !storyViewer.classList.contains('hidden')) {
                ui.closeStoryViewer();
                window.history.pushState({ screen: this.state.currentScreen }, '', '#' + this.state.currentScreen);
                return;
            }

            const commentsModal = document.getElementById('comments-modal');
            if (commentsModal && !commentsModal.classList.contains('hidden')) {
                ui.showCommentsModal(false);
                window.history.pushState({ screen: this.state.currentScreen }, '', '#' + this.state.currentScreen);
                return;
            }

            const notifModal = document.getElementById('notifications-modal');
            if (notifModal && !notifModal.classList.contains('hidden')) {
                ui.closeNotificationsModal();
                window.history.pushState({ screen: this.state.currentScreen }, '', '#' + this.state.currentScreen);
                return;
            }

            const shareMenu = document.getElementById('share-menu');
            if (shareMenu && !shareMenu.classList.contains('hidden')) {
                shareMenu.classList.add('hidden');
                window.history.pushState({ screen: this.state.currentScreen }, '', '#' + this.state.currentScreen);
                return;
            }

            const addMenu = document.getElementById('add-menu');
            if (addMenu && !addMenu.classList.contains('hidden')) {
                addMenu.classList.add('hidden');
                window.history.pushState({ screen: this.state.currentScreen }, '', '#' + this.state.currentScreen);
                return;
            }

            const cartModal = document.getElementById('store-cart-modal');
            if (cartModal && !cartModal.classList.contains('hidden')) {
                ui._closeCart();
                window.history.pushState({ screen: this.state.currentScreen }, '', '#' + this.state.currentScreen);
                return;
            }

            const target = e.state && e.state.screen;

            if (!target) {
                const fallback = auth.isAuthenticated() ? 'main' : 'login';
                if (this.state.currentScreen === fallback) {
                    window.history.pushState({ screen: fallback }, '', '#' + fallback);
                    return;
                }
                ui.navigateTo(fallback, { historyMode: 'replace' });
                return;
            }

            if (target === this.state.currentScreen) return;

            ui.navigateTo(target, { historyMode: 'none' });

            if (target === 'profile') this.loadProfile();
            if (target === 'favorites') this.loadFavorites();
            if (target === 'map') {
                setTimeout(() => {
                    mapManager.init();
                    this.loadMapPromotions();
                }, 200);
            }
        });
    }
};

window.app = app;

document.addEventListener('DOMContentLoaded', () => {
    // Registro do Service Worker (PWA)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch((err) => {
            console.warn('Falha ao registrar service worker:', err);
        });
    }

    // Captura do evento de instalação (PWA)
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        app.state.deferredInstallPrompt = e;
        const btn = document.getElementById('install-app-btn');
        if (btn) btn.classList.remove('hidden');
    });

    window.addEventListener('appinstalled', () => {
        const btn = document.getElementById('install-app-btn');
        if (btn) btn.classList.add('hidden');
        app.state.deferredInstallPrompt = null;
    });

    app.init();
});

// ==========================================
// CHATBOT DE SUPORTE - PROMOCITY
// ==========================================
function criarChat() {
    if (document.getElementById('chatWindow')) return;
    
    const chatHTML = `
        <div class="chat-window hidden" id="chatWindow">
            <div class="chat-header">
                <div class="chat-header-text">
                    <span class="chat-header-title">Assistente PROMOCITY</span>
                    <span class="chat-header-sub">Guia rápido · respostas instantâneas</span>
                </div>
                <button type="button" onclick="fecharChat()" aria-label="Fechar"><i class="fas fa-times"></i></button>
            </div>
            <div class="chat-progress-track" aria-hidden="true"><div class="chat-progress-indeterminate"></div></div>
            <div class="chat-body">
                <div class="chat-messages" id="chatMessages">
                    <div class="message bot">
                        <i class="fas fa-headset"></i>
                        <span>Oi! Sou o assistente do PROMOCITY — estou aqui para te guiar. Por onde começamos?</span>
                    </div>
                </div>
            </div>
            <div class="chat-options" id="chatOptions">
                <button type="button" onclick="mostrarMenuConsumidor()">👤 Sou consumidor</button>
                <button type="button" onclick="mostrarMenuComerciante()">🏪 Sou comerciante</button>
                <button type="button" onclick="mostrarMenuMapa()">🗺️ Mapa e localização</button>
                <button type="button" onclick="mostrarMenuGeral()">💬 Suporte geral</button>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', chatHTML);
}

function abrirChat() {
    criarChat();
    document.getElementById('chatWindow').classList.remove('hidden');
}

function fecharChat() {
    document.getElementById('chatWindow').classList.add('hidden');
}

function mostrarMenuConsumidor() {
    const chatMessages = document.getElementById('chatMessages');
    const chatOptions = document.getElementById('chatOptions');
    
    chatMessages.innerHTML += `
        <div class="message user">
            <i class="fas fa-user"></i>
            <span>👤 Sou consumidor</span>
        </div>
        <div class="message bot">
            <i class="fas fa-headset"></i>
            <span>O que você quer fazer agora?</span>
        </div>
    `;
    
    chatOptions.innerHTML = `
        <button type="button" onclick="responder('consumidor1')">📱 Como criar conta?</button>
        <button type="button" onclick="responder('consumidor2')">🔑 Esqueci minha senha</button>
        <button type="button" onclick="responder('consumidor3')">❤️ Como favoritar?</button>
        <button type="button" onclick="responder('consumidor4')">📋 Onde vejo favoritos?</button>
        <button type="button" onclick="responder('consumidor5')">💬 Falar no WhatsApp</button>
        <button type="button" onclick="responder('consumidor6')">📸 O que são stories?</button>
        <button type="button" onclick="responder('consumidor7')">👀 Como ver stories?</button>
        <button type="button" onclick="responder('consumidor8')">🔍 Como buscar promoções?</button>
        <button type="button" onclick="responder('consumidor9')">🔥 O que é HOT?</button>
        <button type="button" onclick="responder('consumidor10')">⏰ Validade da promoção</button>
        <button type="button" onclick="voltarInicio()">↩️ Voltar ao início</button>
    `;
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function mostrarMenuComerciante() {
    const chatMessages = document.getElementById('chatMessages');
    const chatOptions = document.getElementById('chatOptions');
    
    chatMessages.innerHTML += `
        <div class="message user">
            <i class="fas fa-user"></i>
            <span>🏪 Sou comerciante</span>
        </div>
        <div class="message bot">
            <i class="fas fa-headset"></i>
            <span>O que você quer fazer agora?</span>
        </div>
    `;
    
    chatOptions.innerHTML = `
        <button type="button" onclick="responder('comerciante1')">📝 Como me cadastrar como comerciante?</button>
        <button type="button" onclick="responder('comerciante2')">📢 Como publicar promoção?</button>
        <button type="button" onclick="responder('comerciante3')">✏️ Como editar promoção?</button>
        <button type="button" onclick="responder('comerciante4')">🗑️ Como excluir promoção?</button>
        <button type="button" onclick="responder('comerciante5')">📍 Colocar endereço no mapa</button>
        <button type="button" onclick="responder('comerciante6')">⚠️ Endereço não aparece</button>
        <button type="button" onclick="responder('comerciante7')">📸 Como publicar story?</button>
        <button type="button" onclick="responder('comerciante8')">⏱️ Duração dos stories</button>
        <button type="button" onclick="responder('comerciante9')">❤️ Ver curtidas</button>
        <button type="button" onclick="responder('comerciante10')">🔗 Link da loja virtual</button>
        <button type="button" onclick="voltarInicio()">↩️ Voltar ao início</button>
    `;
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function mostrarMenuMapa() {
    const chatMessages = document.getElementById('chatMessages');
    const chatOptions = document.getElementById('chatOptions');
    
    chatMessages.innerHTML += `
        <div class="message user">
            <i class="fas fa-user"></i>
            <span>🗺️ Mapa e localização</span>
        </div>
        <div class="message bot">
            <i class="fas fa-headset"></i>
            <span>O que você quer fazer agora?</span>
        </div>
    `;
    
    chatOptions.innerHTML = `
        <button type="button" onclick="responder('mapa1')">📍 Ver promoções perto de mim</button>
        <button type="button" onclick="responder('mapa2')">❌ Mapa não carrega</button>
        <button type="button" onclick="responder('mapa3')">🧭 Traçar rota</button>
        <button type="button" onclick="responder('mapa4')">📱 Ativar localização</button>
        <button type="button" onclick="voltarInicio()">↩️ Voltar ao início</button>
    `;
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function mostrarMenuGeral() {
    const chatMessages = document.getElementById('chatMessages');
    const chatOptions = document.getElementById('chatOptions');
    
    chatMessages.innerHTML += `
        <div class="message user">
            <i class="fas fa-user"></i>
            <span>💬 Suporte geral</span>
        </div>
        <div class="message bot">
            <i class="fas fa-headset"></i>
            <span>O que você quer fazer agora?</span>
        </div>
    `;
    
    chatOptions.innerHTML = `
        <button type="button" onclick="responder('geral1')">💰 App é gratuito?</button>
        <button type="button" onclick="responder('geral2')">👤 Preciso criar conta?</button>
        <button type="button" onclick="responder('geral3')">🐛 Reportar problema</button>
        <button type="button" onclick="responder('geral4')">🔒 Segurança dos dados</button>
        <button type="button" onclick="responder('geral5')">📞 Contato suporte</button>
        <button type="button" onclick="responder('geral6')">🤝 Convidar amigos</button>
        <button type="button" onclick="voltarInicio()">↩️ Voltar ao início</button>
    `;
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function responder(perguntaId) {
    const chatMessages = document.getElementById('chatMessages');
    const chatOptions = document.getElementById('chatOptions');
    
    let pergunta = "";
    let resposta = "";
    
    // Respostas para Consumidores
    if (perguntaId === 'consumidor1') {
        pergunta = "📱 Como criar conta?";
        resposta = "Na tela inicial, clique em 'Criar conta'. Preencha seu nome, email, senha e WhatsApp. Você receberá um email de confirmação.";
    }
    else if (perguntaId === 'consumidor2') {
        pergunta = "🔑 Esqueci minha senha";
        resposta = "Na tela de login, clique em 'Esqueci a senha'. Digite seu email e enviaremos um link para criar uma nova senha. Verifique sua caixa de entrada e spam.";
    }
    else if (perguntaId === 'consumidor3') {
        pergunta = "❤️ Como favoritar?";
        resposta = "Nos cards das promoções, clique no ícone de coração ❤️. A promoção será salva automaticamente na sua lista de favoritos.";
    }
    else if (perguntaId === 'consumidor4') {
        pergunta = "📋 Onde vejo favoritos?";
        resposta = "No menu inferior do app, clique no ícone de coração ❤️ 'Favoritos'. Lá estarão todas as promoções que você salvou.";
    }
    else if (perguntaId === 'consumidor5') {
        pergunta = "💬 Falar no WhatsApp";
        resposta = "Nos cards das promoções, clique no botão verde do WhatsApp 💬. Você será direcionado para conversar diretamente com o comerciante.";
    }
    else if (perguntaId === 'consumidor6') {
        pergunta = "📸 O que são stories?";
        resposta = "Stories são fotos ou vídeos rápidos que os comerciantes publicam e que desaparecem em 24 horas. Ficam na parte superior do app.";
    }
    else if (perguntaId === 'consumidor7') {
        pergunta = "👀 Como ver stories?";
        resposta = "Clique no círculo com a foto do comerciante na parte superior da tela. Os stories serão reproduzidos em sequência.";
    }
    else if (perguntaId === 'consumidor8') {
        pergunta = "🔍 Como buscar promoções?";
        resposta = "Use a lupa 🔍 no menu inferior. Digite o nome da promoção ou produto. Você também pode filtrar por categorias como Alimentação, Vestuário, etc.";
    }
    else if (perguntaId === 'consumidor9') {
        pergunta = "🔥 O que é HOT?";
        resposta = "O selo 🔥 HOT indica promoções em destaque! São ofertas especiais que os comerciantes querem destacar.";
    }
    else if (perguntaId === 'consumidor10') {
        pergunta = "⏰ Validade da promoção";
        resposta = "No card da promoção aparece a data de validade. Promoções vencidas não aparecem mais no feed.";
    }
    
    // Respostas para Comerciantes
    else if (perguntaId === 'comerciante1') {
        pergunta = "📝 Como me cadastrar como comerciante?";
        resposta = "Ao criar sua conta, você é cadastrado como consumidor. Depois, no seu perfil, clique em 'Quero anunciar meu negócio' e preencha os dados do seu comércio.";
    }
    else if (perguntaId === 'comerciante2') {
        pergunta = "📢 Como publicar promoção?";
        resposta = "Clique no botão '+' no menu inferior e escolha 'Nova Promoção'. Preencha título, descrição, categoria, preços, validade e adicione uma foto. Clique em 'Publicar'.";
    }
    else if (perguntaId === 'comerciante3') {
        pergunta = "✏️ Como editar promoção?";
        resposta = "Vá até a promoção no feed ou no seu perfil e clique no ícone de lápis ✏️. Faça as alterações e clique em 'Atualizar Promoção'.";
    }
    else if (perguntaId === 'comerciante4') {
        pergunta = "🗑️ Como excluir promoção?";
        resposta = "No card da sua promoção, clique no ícone da lixeira 🗑️ e confirme a exclusão.";
    }
    else if (perguntaId === 'comerciante5') {
        pergunta = "📍 Colocar endereço no mapa";
        resposta = "No seu perfil, clique em editar ✏️. No campo 'Endereço', digite seu endereço completo. Ao salvar, o app converte para coordenadas e sua localização aparece no mapa.";
    }
    else if (perguntaId === 'comerciante6') {
        pergunta = "⚠️ Endereço não aparece";
        resposta = "Verifique se o endereço está completo (rua, número, bairro, cidade). Ex: 'Rua XV de Novembro, 100, Centro, Ivaí - PR'. Se ainda assim não funcionar, contate o suporte.";
    }
    else if (perguntaId === 'comerciante7') {
        pergunta = "📸 Como publicar story?";
        resposta = "Clique no botão '+' no menu inferior e escolha 'Novo Story'. Selecione uma imagem, adicione WhatsApp e legenda (opcionais) e defina a validade. Clique em 'Publicar Story'.";
    }
    else if (perguntaId === 'comerciante8') {
        pergunta = "⏱️ Duração dos stories";
        resposta = "Os stories duram 24 horas a partir da publicação. Depois disso, somem automaticamente.";
    }
    else if (perguntaId === 'comerciante9') {
        pergunta = "❤️ Ver curtidas";
        resposta = "Nos cards das suas promoções, o número de curtidas aparece ao lado do ícone de coração.";
    }
    else if (perguntaId === 'comerciante10') {
        pergunta = "🔗 Link da loja virtual";
        resposta = "Sim! No seu perfil, ao editar, há o campo 'Link da loja virtual'. Coloque o endereço do seu site, Instagram ou Facebook.";
    }
    
    // Respostas para Mapa
    else if (perguntaId === 'mapa1') {
        pergunta = "📍 Ver promoções perto de mim";
        resposta = "Clique no botão do mapa 🗺️ flutuante no canto inferior direito. Ative a localização do celular para ver as promoções mais próximas.";
    }
    else if (perguntaId === 'mapa2') {
        pergunta = "❌ Mapa não carrega";
        resposta = "Verifique sua conexão com a internet. Tente fechar e abrir o mapa novamente. Se o problema persistir, atualize a página.";
    }
    else if (perguntaId === 'mapa3') {
        pergunta = "🧭 Traçar rota";
        resposta = "No mapa, clique no marcador da promoção. No popup, clique no botão 'Rota' 🗺️. Você será direcionado ao Google Maps com o destino já preenchido.";
    }
    else if (perguntaId === 'mapa4') {
        pergunta = "📱 Ativar localização";
        resposta = "O app pedirá permissão na primeira vez que você abrir o mapa. Você pode permitir ou negar. Para melhores resultados, recomendamos permitir.";
    }
    
    // Respostas para Geral
    else if (perguntaId === 'geral1') {
        pergunta = "💰 App é gratuito?";
        resposta = "Sim! O PROMOCITY é 100% gratuito tanto para consumidores quanto para comerciantes.";
    }
    else if (perguntaId === 'geral2') {
        pergunta = "👤 Preciso criar conta?";
        resposta = "Não! Você pode ver todas as promoções sem criar conta. Mas para favoritar, curtir ou publicar, precisará fazer login.";
    }
    else if (perguntaId === 'geral3') {
        pergunta = "🐛 Reportar problema";
        resposta = "Use este chat de suporte ou envie um email para [coloque aqui o email de suporte]. Toda sugestão é bem-vinda!";
    }
    else if (perguntaId === 'geral4') {
        pergunta = "🔒 Segurança dos dados";
        resposta = "Totalmente! Usamos o Supabase, uma plataforma segura e confiável. Seus dados são protegidos e não compartilhamos com terceiros.";
    }
    else if (perguntaId === 'geral5') {
        pergunta = "📞 Contato suporte";
        resposta = "Você já está no canal certo! Use este chat ou nos chame no Instagram @promocity ou email suporte@promocity.com";
    }
    else if (perguntaId === 'geral6') {
        pergunta = "🤝 Convidar amigos";
        resposta = "Compartilhe qualquer promoção clicando no ícone de compartilhar 🔗. Escolha WhatsApp, Facebook ou copie o link.";
    }
    
    chatMessages.innerHTML += `
        <div class="message user">
            <i class="fas fa-user"></i>
            <span>${pergunta}</span>
        </div>
        <div class="message bot">
            <i class="fas fa-headset"></i>
            <span>${resposta}</span>
        </div>
    `;
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    setTimeout(() => {
        if (perguntaId.startsWith('consumidor')) mostrarMenuConsumidor();
        else if (perguntaId.startsWith('comerciante')) mostrarMenuComerciante();
        else if (perguntaId.startsWith('mapa')) mostrarMenuMapa();
        else if (perguntaId.startsWith('geral')) mostrarMenuGeral();
    }, 3000);
}

function voltarInicio() {
    const chatMessages = document.getElementById('chatMessages');
    const chatOptions = document.getElementById('chatOptions');
    
    chatMessages.innerHTML += `
        <div class="message bot">
            <i class="fas fa-headset"></i>
            <span>Quer explorar outro assunto? É só escolher abaixo.</span>
        </div>
    `;
    
    chatOptions.innerHTML = `
        <button type="button" onclick="mostrarMenuConsumidor()">👤 Sou consumidor</button>
        <button type="button" onclick="mostrarMenuComerciante()">🏪 Sou comerciante</button>
        <button type="button" onclick="mostrarMenuMapa()">🗺️ Mapa e localização</button>
        <button type="button" onclick="mostrarMenuGeral()">💬 Suporte geral</button>
    `;
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

document.addEventListener('DOMContentLoaded', function() {
    const btnChat = document.getElementById('btn-chat');
    if (btnChat) {
        btnChat.addEventListener('click', abrirChat);
    }
});