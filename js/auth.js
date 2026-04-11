/**
 * AUTENTICAÇÃO - PROMOCITY
 * Gerenciamento completo de autenticação via Supabase Auth
 * VERSÃO CORRIGIDA - Com campo business_store_link
 */

const auth = {
    // Estado atual
    currentUser: null,
    session: null,

    /**
     * Inicializa o sistema de autenticação
     */
    async init() {
        // Verifica sessão existente
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        if (error) {
            console.error('Erro ao verificar sessão:', error);
            return false;
        }

        if (session) {
            this.session = session;
            await this.loadUser();
            return true;
        }

        return false;
    },

    /**
     * Carrega dados do usuário logado
     */
    async loadUser() {
        try {
            const userData = await db.getCurrentUser();
            if (userData) {
                this.currentUser = userData;
                return userData;
            }
        } catch (error) {
            console.error('Erro ao carregar usuário:', error);
        }
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) {
                this.currentUser = null;
                return null;
            }
            if (typeof db !== 'undefined' && db._buildFallbackCurrentUser) {
                const fallback = db._buildFallbackCurrentUser(user);
                this.currentUser = fallback;
                return fallback;
            }
        } catch (_) {}
        return null;
    },

    /**
     * Registro de novo usuário - AGORA SEMPRE COMO CONSUMIDOR
     */
    async register(userData) {
        try {
            const normalizedName = String(userData?.name || '').trim();
            const normalizedEmail = String(userData?.email || '').trim().toLowerCase();
            const normalizedPhone = String(userData?.phone || '').trim();
            const normalizedPassword = String(userData?.password || '');

            // Validações
            if (!normalizedName) {
                throw new Error('Informe seu nome completo');
            }

            if (!utils.isValidEmail(normalizedEmail)) {
                throw new Error('Email inválido');
            }
            
            if (normalizedPassword.length < 6) {
                throw new Error('A senha deve ter pelo menos 6 caracteres');
            }

            if (!utils.isValidPhone(normalizedPhone)) {
                throw new Error('Número de telefone inválido');
            }

            // Cria usuário no Auth
            const { data: authData, error: authError } = await supabaseClient.auth.signUp({
                email: normalizedEmail,
                password: normalizedPassword,
                options: {
                    data: {
                        name: normalizedName,
                        phone: normalizedPhone,
                        user_type: 'consumer' // Sempre consumer no cadastro
                    }
                }
            });

            if (authError) {
                // Tradução de erros comuns do Supabase
                const authMsg = String(authError?.message || '').toLowerCase();
                if (authMsg.includes('already registered') || authMsg.includes('already been registered')) {
                    throw new Error('Este email já está cadastrado');
                }
                if (authMsg.includes('invalid email')) {
                    throw new Error('Email inválido');
                }
                if (authMsg.includes('password')) {
                    throw new Error('Senha inválida. Use ao menos 6 caracteres.');
                }
                throw authError;
            }

            if (!authData?.user?.id) {
                throw new Error('Cadastro criado, mas não foi possível obter o usuário. Tente fazer login novamente.');
            }

            // ========== ALTERAÇÃO: Sempre cria como consumer ==========
            await db.createUserProfile(authData.user.id, {
                name: normalizedName,
                email: normalizedEmail,
                phone: normalizedPhone,
                userType: 'consumer', // Forçado para consumer
                // Campos de comerciante ignorados (vêm vazios do formulário)
                businessName: null,
                businessAddress: null,
                businessCategory: null,
                businessStoreLink: null
            });
            // =========================================================

            return { success: true, user: authData.user };
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Login de usuário
     */
    async login(email, password) {
        try {
            if (!email || !password) {
                throw new Error('Preencha email e senha');
            }

            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                if (error.message.includes('Invalid login')) {
                    throw new Error('Email ou senha incorretos');
                }
                if (error.message.includes('Email not confirmed')) {
                    throw new Error('Email não confirmado. Verifique sua caixa de entrada.');
                }
                throw error;
            }

            this.session = data.session;
            await this.loadUser();
            
            return { success: true, user: data.user };
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Logout do usuário
     */
    async logout() {
        try {
            const { error } = await supabaseClient.auth.signOut();
            if (error) throw error;

            // Limpa estado local
            this.currentUser = null;
            this.session = null;
            
            // Limpa cache (se utils.cache existir)
            if (utils.cache && utils.cache.clear) {
                utils.cache.clear();
            }
            
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Recuperação de senha
     */
    async resetPassword(email) {
        try {
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password.html`
            });
            
            if (error) throw error;
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Atualiza senha
     */
    async updatePassword(newPassword) {
        try {
            const { error } = await supabaseClient.auth.updateUser({
                password: newPassword
            });
            
            if (error) throw error;
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Atualiza avatar do usuário
     */
    async updateAvatar(file) {
        try {
            if (!this.currentUser) throw new Error('Usuário não autenticado');

            // Comprime imagem
            const compressed = await utils.compressImage(file, 400, 0.8);
            
            // Upload
            const url = await db.uploadImage(compressed, 'avatars', this.currentUser.id);
            
            // Atualiza perfil
            await db.updateUserProfile(this.currentUser.id, { avatar_url: url });
            
            // Recarrega dados
            await this.loadUser();
            
            return { success: true, url };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async updateCoverImage(file) {
        try {
            if (!this.currentUser) throw new Error('Usuário não autenticado');

            const compressed = await utils.compressImage(file, 1200, 0.82);
            const url = await db.uploadImage(compressed, 'avatars', `${this.currentUser.id}/covers`);
            await db.updateUserProfile(this.currentUser.id, { cover_url: url });
            await this.loadUser();

            return { success: true, url };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async removeCoverImage() {
        try {
            if (!this.currentUser) throw new Error('Usuário não autenticado');

            await db.updateUserProfile(this.currentUser.id, { cover_url: null });
            await this.loadUser();

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Verifica se usuário é comerciante
     */
    isMerchant() {
        return this.currentUser?.profile?.user_type === 'merchant';
    },

    isMotoboy() {
        return this.currentUser?.profile?.is_motoboy === true;
    },

    /**
     * Verifica se está logado
     */
    isAuthenticated() {
        return !!this.currentUser;
    },

    /**
     * Busca perfil de um autor pelo ID - NOVO MÉTODO
     */
    async loadProfileByAuthor(authorId) {
        try {
            const { data, error } = await supabaseClient
                .from(pcUsersTable())
                .select('*')
                .eq((typeof pcProfileAuthColumn === 'function' ? pcProfileAuthColumn() : 'id'), authorId)
                .single();
                
            if (error) throw error;
            
            // Busca as promoções deste autor
            const { data: promotions, error: promoError } = await supabaseClient
                .from('promotions')
                .select('*')
                .eq('author_id', authorId)
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false });
                
            if (!promoError) {
                data.promotions = promotions;
                data.promotions_count = promotions?.length || 0;
            }

            try {
                data.store_highlights = typeof db !== 'undefined' && typeof db.getStoreHighlights === 'function'
                    ? await db.getStoreHighlights(authorId)
                    : [];
            } catch (_) {
                data.store_highlights = [];
            }

            return data;
        } catch (error) {
            console.error('Erro ao carregar perfil do autor:', error);
            return null;
        }
    },

    /**
     * Listener de mudanças de auth
     */
    onAuthStateChange(callback) {
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') {
                this.session = session;
                this.loadUser().then(() => callback('SIGNED_IN', this.currentUser));
            } else if (event === 'SIGNED_OUT') {
                this.currentUser = null;
                this.session = null;
                callback('SIGNED_OUT', null);
            } else if (event === 'USER_UPDATED') {
                this.loadUser().then(() => callback('USER_UPDATED', this.currentUser));
            }
        });
    }
};

// Exportação global
window.auth = auth;