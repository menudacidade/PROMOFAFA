/**
 * OPERAÇÕES DE BANCO DE DADOS - PROMOCITY
 * Todas as operações CRUD utilizando Supabase
 * VERSÃO CORRIGIDA - Com sistema de likes, horário do servidor e coordenadas para mapa
 */

const db = {
    // ==================== USUÁRIOS ====================
    _isProfileTableUnavailableError(error) {
        const msg = String(error?.message || '');
        return (
            error?.code === 'PGRST205' ||
            error?.code === 'PGRST204' ||
            /schema cache|Could not find the table|relation .* does not exist|does not exist/i.test(msg)
        );
    },

    _isMissingColumnError(error) {
        const msg = String(error?.message || '');
        return (
            error?.code === '42703' ||
            error?.code === 'PGRST204' ||
            /column|Could not find.*column|schema cache|does not exist/i.test(msg)
        );
    },

    _extractMissingColumnName(error) {
        const raw = `${String(error?.message || '')} ${String(error?.details || '')} ${String(error?.hint || '')}`;
        const patterns = [
            /Could not find the ['"]([^'"]+)['"] column/i,
            /column ['"]([^'"]+)['"]/i,
            /column\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+/i,
            /"([a-zA-Z_][a-zA-Z0-9_]*)"/
        ];
        for (const p of patterns) {
            const m = raw.match(p);
            if (m && m[1]) return m[1];
        }
        return null;
    },

    _buildFallbackCurrentUser(authUser) {
        const meta = authUser?.user_metadata || {};
        const appMeta = authUser?.app_metadata || {};
        const fallbackName =
            meta.name ||
            meta.full_name ||
            (authUser?.email ? String(authUser.email).split('@')[0] : '') ||
            'Usuário';
        const profile = {
            id: authUser?.id || null,
            name: fallbackName,
            email: authUser?.email || '',
            phone: meta.phone || null,
            user_type: meta.user_type || appMeta.user_type || null,
            avatar_url: meta.avatar_url || null,
            favorites: [],
            promotions: [],
            promotions_count: 0,
            followers_count: 0,
            following_count: 0,
            total_likes: 0,
            store_highlights: [],
            business_name: meta.business_name || null,
            business_address: meta.business_address || null,
            business_category: meta.business_category || null,
            business_store_link: meta.business_store_link || null,
            store_info: meta.store_info || []
        };
        return { ...authUser, profile, _profileFallback: true };
    },

    async _isMerchantHighlightsAvailable() {
        if (typeof resolveMerchantHighlightsAvailability === 'function') {
            return await resolveMerchantHighlightsAvailability();
        }
        return true;
    },

    _isMissingStoreHighlightsColumnError(error) {
        const msg = String(error?.message || '');
        return (
            error?.code === '42703' ||
            error?.code === 'PGRST204' ||
            /store_highlights|column|schema cache|does not exist|Could not find/i.test(msg)
        );
    },

    _getProfileHighlightsCandidateColumns() {
        return ['store_highlights', 'merchant_highlights', 'highlights', 'shop_highlights'];
    },

    _resolveProfileHighlightsColumnFromRow(row) {
        if (!row || typeof row !== 'object') return null;
        const cols = this._getProfileHighlightsCandidateColumns();
        return cols.find((c) => Object.prototype.hasOwnProperty.call(row, c)) || null;
    },

    async _readProfileRow(merchantId) {
        const authCol = (typeof pcProfileAuthColumn === 'function' ? pcProfileAuthColumn() : 'id');
        const { data, error } = await supabaseClient
            .from(pcUsersTable())
            .select('*')
            .eq(authCol, merchantId)
            .maybeSingle();
        if (error) throw error;
        return data || null;
    },

    _getHighlightsLocalKey(merchantId) {
        return `promocity_store_highlights_${merchantId}`;
    },

    _highlightsTable() {
        if (typeof pcHighlightsTable === 'function') return pcHighlightsTable();
        return 'merchant_highlights';
    },

    _readHighlightsLocal(merchantId) {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return [];
            const raw = window.localStorage.getItem(this._getHighlightsLocalKey(merchantId));
            return this.normalizeMerchantHighlights(raw ? JSON.parse(raw) : []);
        } catch (_) {
            return [];
        }
    },

    _writeHighlightsLocal(merchantId, arr) {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return;
            window.localStorage.setItem(this._getHighlightsLocalKey(merchantId), JSON.stringify(arr || []));
        } catch (_) {}
    },

    async _syncLocalHighlightsToTable(merchantId) {
        const available = await this._isMerchantHighlightsAvailable();
        if (!available) return;
        const local = this._readHighlightsLocal(merchantId);
        if (!Array.isArray(local) || local.length === 0) return;
        const table = this._highlightsTable();
        try {
            const { data: existing, error: existingError } = await supabaseClient
                .from(table)
                .select('id')
                .eq('merchant_user_id', merchantId)
                .limit(1);
            if (existingError) return;
            if (Array.isArray(existing) && existing.length > 0) return;

            const rows = local.map((x) => ({
                id: x.id || ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`),
                merchant_user_id: merchantId,
                title: x.title || 'Destaque',
                description: x.description || null,
                image_url: x.image_url || null,
                price: x.price ?? null,
                created_at: x.created_at || new Date().toISOString(),
                updated_at: x.updated_at || new Date().toISOString()
            }));
            const { error: insertError } = await supabaseClient
                .from(table)
                .insert(rows);
            if (!insertError) {
                this._writeHighlightsLocal(merchantId, []);
            }
        } catch (_) {}
    },
    
    /**
     * Cria perfil de usuário na tabela 'users' após registro no Auth
     */
    async createUserProfile(userId, userData) {
        const payload = {
            id: userId,
            user_id: userId,
            name: userData.name,
            email: userData.email,
            phone: userData.phone,
            user_type: userData.userType,
            avatar_url: null,
            favorites: [],
            created_at: new Date().toISOString(),
            // Campos específicos para comerciante
            business_name: userData.businessName || null,
            business_address: userData.businessAddress || null,
            business_category: userData.businessCategory || null,
            business_description: null,
            business_hours: null,
            business_store_link: userData.businessStoreLink || null,
            // NOVOS: Coordenadas para o mapa
            latitude: userData.latitude ? parseFloat(userData.latitude) : null,
            longitude: userData.longitude ? parseFloat(userData.longitude) : null
        };

        let currentPayload = { ...payload };
        const removableColumns = new Set([
            'id',
            'user_id',
            'phone',
            'user_type',
            'avatar_url',
            'favorites',
            'created_at',
            'business_name',
            'business_address',
            'business_category',
            'business_description',
            'business_hours',
            'business_store_link',
            'latitude',
            'longitude'
        ]);

        for (let attempt = 0; attempt < 12; attempt++) {
            const { error } = await supabaseClient
                .from(pcUsersTable())
                .insert([currentPayload]);

            if (!error) return currentPayload;

            const msg = String(error?.message || '').toLowerCase();
            const isDuplicate =
                error?.code === '23505' ||
                msg.includes('duplicate key') ||
                msg.includes('already exists');
            if (isDuplicate) return currentPayload;

            if (!this._isMissingColumnError(error)) {
                throw error;
            }

            const missingCol = this._extractMissingColumnName(error);
            if (!missingCol || !Object.prototype.hasOwnProperty.call(currentPayload, missingCol) || !removableColumns.has(missingCol)) {
                throw error;
            }

            delete currentPayload[missingCol];
        }

        throw new Error('Falha ao criar perfil: esquema da tabela users incompatível.');
    },

    /**
     * Busca perfil do usuário logado
     */
    async getCurrentUser() {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return null;
        const tableName = (typeof pcUsersTable === 'function' ? pcUsersTable() : 'users');
        const authCol = (typeof pcProfileAuthColumn === 'function' ? pcProfileAuthColumn() : 'id');
        const { data, error } = await supabaseClient
            .from(tableName)
            .select('*')
            .eq(authCol, user.id)
            .single();
            
        if (error) {
            if (this._isProfileTableUnavailableError(error)) {
                const tbl = typeof pcUsersTable === 'function' ? pcUsersTable() : 'users';
                console.warn(`[perfil] Tabela de perfil indisponível na API (${tbl}). Usando fallback local do Auth.`, error);
                return this._buildFallbackCurrentUser(user);
            }
            throw error;
        }
        
        // Calcular estatísticas do perfil
        const profile = { ...data };
        
        // Se for comerciante: lista de promoções ativas (vitrine no perfil) + total de curtidas
        if (profile.user_type === 'merchant') {
            const { data: promotions, error: promoError } = await supabaseClient
                .from('promotions')
                .select('*')
                .eq('author_id', user.id)
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false });

            if (!promoError) {
                profile.promotions = promotions || [];
                profile.promotions_count = profile.promotions.length;
            } else {
                profile.promotions = [];
                profile.promotions_count = 0;
            }

            // Soma de likes das promoções do comerciante
            const { data: likesData, error: likesError } = await supabaseClient
                .from('promotions')
                .select('likes_count')
                .eq('author_id', user.id);
                
            if (!likesError) {
                profile.total_likes = likesData.reduce((sum, p) => sum + (p.likes_count || 0), 0);
            }

            try {
                await this._syncLocalHighlightsToTable(user.id);
                profile.store_highlights = await this.getStoreHighlights(user.id);
            } catch (_) {
                profile.store_highlights = [];
            }
        }
        
        return { ...user, profile };
    },

    /**
     * Busca comércios (user_type = merchant) pelo nome do negócio ou nome do perfil.
     * Não depende de produtos/promoções. Usa duas consultas ilike para evitar problemas de escape no .or().
     */
    async searchMerchantProfiles(rawQuery, options = {}) {
        const limit = Math.min(Math.max(Number(options.limit) || 40, 1), 100);
        const q = String(rawQuery || '').trim();
        if (!q) return [];

        const table = typeof pcUsersTable === 'function' ? pcUsersTable() : 'users';
        const authCol = typeof pcProfileAuthColumn === 'function' ? pcProfileAuthColumn() : 'id';
        const pattern = `%${q.replace(/%/g, '')}%`;

        const sel = `${authCol}, name, business_name, avatar_url, user_type`;
        const base = () => supabaseClient.from(table).select(sel).eq('user_type', 'merchant');

        const [r1, r2] = await Promise.all([
            base().ilike('business_name', pattern).limit(limit),
            base().ilike('name', pattern).limit(limit)
        ]);

        if (r1.error) throw r1.error;
        if (r2.error) throw r2.error;

        const map = new Map();
        const rows = [...(r1.data || []), ...(r2.data || [])];
        for (const row of rows) {
            const rid = row[authCol];
            if (rid == null) continue;
            const key = String(rid);
            if (!map.has(key)) {
                map.set(key, { ...row, id: rid });
            }
        }

        const ql = q.toLowerCase();
        const displayName = (row) => {
            const bn = (row.business_name || '').trim();
            const n = (row.name || '').trim();
            return (bn || n || 'Comércio');
        };

        const list = Array.from(map.values());
        list.sort((a, b) => {
            const da = displayName(a).toLowerCase();
            const db = displayName(b).toLowerCase();
            const sa = da.startsWith(ql) ? 0 : 1;
            const sb = db.startsWith(ql) ? 0 : 1;
            if (sa !== sb) return sa - sb;
            return da.localeCompare(db, 'pt-BR');
        });

        return list.slice(0, limit);
    },

    /**
     * Atualiza perfil do usuário
     */
    async updateUserProfile(userId, updates) {
        if (updates.latitude !== undefined) {
            updates.latitude = updates.latitude ? parseFloat(updates.latitude) : null;
        }
        if (updates.longitude !== undefined) {
            updates.longitude = updates.longitude ? parseFloat(updates.longitude) : null;
        }

        let currentUpdates = { ...updates };
        const authCol = (typeof pcProfileAuthColumn === 'function' ? pcProfileAuthColumn() : 'id');

        for (let attempt = 0; attempt < 8; attempt++) {
            const { data, error } = await supabaseClient
                .from(pcUsersTable())
                .update(currentUpdates)
                .eq(authCol, userId)
                .select()
                .single();

            if (!error) return data;

            if (!this._isMissingColumnError(error)) throw error;

            const missingCol = this._extractMissingColumnName(error);
            if (!missingCol || !Object.prototype.hasOwnProperty.call(currentUpdates, missingCol)) {
                throw error;
            }

            console.warn(`[perfil] Coluna '${missingCol}' não existe na tabela, ignorando no update.`);
            delete currentUpdates[missingCol];

            if (Object.keys(currentUpdates).length === 0) {
                throw new Error('Nenhum campo válido para atualizar');
            }
        }

        throw new Error('Falha ao atualizar perfil: esquema da tabela incompatível.');
    },

    // ==================== FUNÇÃO AUXILIAR PARA HORÁRIO DO SERVIDOR ====================

    // Cache de horário do servidor: evita múltiplas RPCs get_server_time por página.
    // TTL de 30 s — suficiente para filtrar promoções expiradas sem sobrecarregar.
    _serverTimeCache: { value: null, fetchedAt: 0, ttlMs: 30000 },

    /**
     * Obtém o horário atual do servidor Supabase (com cache de 30 s).
     * @returns {Promise<string>} ISO string do horário do servidor
     */
    async getServerTime() {
        const now = Date.now();
        const cache = this._serverTimeCache;
        if (cache.value && (now - cache.fetchedAt) < cache.ttlMs) {
            return cache.value;
        }
        try {
            const { data, error } = await supabaseClient.rpc('get_server_time');
            if (error) {
                if (typeof window !== 'undefined' && window.PROMOCITY_DEBUG) {
                    console.warn('Erro ao obter horário do servidor, usando horário local:', error);
                }
                const fallback = new Date().toISOString();
                this._serverTimeCache = { value: fallback, fetchedAt: now, ttlMs: cache.ttlMs };
                return fallback;
            }
            this._serverTimeCache = { value: data, fetchedAt: now, ttlMs: cache.ttlMs };
            return data;
        } catch (error) {
            if (typeof window !== 'undefined' && window.PROMOCITY_DEBUG) {
                console.warn('Erro na RPC, usando horário local:', error);
            }
            const fallback = new Date().toISOString();
            this._serverTimeCache = { value: fallback, fetchedAt: now, ttlMs: cache.ttlMs };
            return fallback;
        }
    },

    // ==================== PROMOÇÕES ====================
    
    /**
     * Busca promoções com filtros opcionais - Usando horário do servidor com margem de segurança
     * CORRIGIDO: Agora inclui coordenadas do autor para o mapa
     */
    async getPromotions(options = {}) {
        let query = supabaseClient
            .from('promotions')
            .select(`
                *,
                author:users(
                    id, 
                    name, 
                    avatar_url, 
                    business_name, 
                    user_type, 
                    phone, 
                    business_store_link,
                    latitude,
                    longitude
                )
            `)
            .order('created_at', { ascending: false });

        // Obtém o horário do servidor para filtro preciso
        const serverTime = await this.getServerTime();

        // Margem de 10 minutos para cobrir diferença de timezone/relógio entre cliente e servidor
        const serverDate = new Date(serverTime);
        const marginDate = new Date(serverDate.getTime() - 10 * 60 * 1000);

        // Filtro no banco: somente promoções ainda válidas (com margem mínima)
        query = query.gt('expires_at', marginDate.toISOString());

        // Filtro por categoria
        if (options.category) {
            query = query.eq('category', options.category);
        }

        // Filtro por busca textual
        if (options.search) {
            query = query.or(`title.ilike.%${options.search}%,description.ilike.%${options.search}%`);
        }

        // Filtro HOT
        if (options.hotOnly) {
            query = query.eq('is_hot', true);
        }

        // Paginação
        if (options.limit) {
            query = query.limit(options.limit);
        }
        
        if (options.offset) {
            query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
        }

        const { data, error } = await query;
        if (error) throw error;
        
        // 🔥 FILTRO FINAL NO FRONTEND (remover as que realmente expiraram)
        const now = new Date(serverTime);
        const filteredData = data.filter(promo => {
            const expiresAt = new Date(promo.expires_at);
            return expiresAt > now;
        });
        
        return filteredData;
    },

    /**
     * Busca promoções com coordenadas para o mapa - VERSÃO MELHORADA COM LOGS
     * Retorna apenas promoções que têm latitude/longitude válidas
     */
    async getPromotionsForMap(options = {}) {
        const promotions = await this.getPromotions(options);

        const comCoordenadas = promotions.filter(promo => {
            if (!promo.author) return false;
            const lat = promo.author.latitude;
            const lng = promo.author.longitude;
            if (lat == null || lng == null) return false;
            return !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng));
        });

        return comCoordenadas;
    },

    /**
     * Cria nova promoção
     */
    async createPromotion(promotionData) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        // Verifica se é comerciante
        const { data: profile, error: profileError } = await supabaseClient
            .from(pcUsersTable())
            .select('user_type')
            .eq((typeof pcProfileAuthColumn === 'function' ? pcProfileAuthColumn() : 'id'), user.id)
            .single();

        if (profileError || !profile) {
            throw new Error('Não foi possível verificar o tipo de conta');
        }

        if (profile.user_type !== 'merchant') {
            throw new Error('Apenas comerciantes podem publicar promoções');
        }

        const { data, error } = await supabaseClient
            .from('promotions')
            .insert([{
                author_id: user.id,
                title: promotionData.title,
                description: promotionData.description,
                image_url: promotionData.imageUrl,
                old_price: promotionData.oldPrice,
                new_price: promotionData.newPrice,
                is_hot: promotionData.isHot || false,
                expires_at: promotionData.expiresAt,
                category: promotionData.category,
                likes_count: 0,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Atualiza uma promoção existente.
     * Filtra por author_id (defesa em profundidade além do RLS).
     * O RLS no Supabase DEVE reforçar isso na policy UPDATE de promotions.
     */
    async updatePromotion(promoId, updates) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const { data, error } = await supabaseClient
            .from('promotions')
            .update({
                title: updates.title,
                description: updates.description,
                image_url: updates.imageUrl,
                old_price: updates.oldPrice,
                new_price: updates.newPrice,
                is_hot: updates.isHot,
                expires_at: updates.expiresAt,
                category: updates.category
            })
            .eq('id', promoId)
            .eq('author_id', user.id)
            .select();

        if (error) throw error;

        if (!data || data.length === 0) {
            throw new Error('Promoção não encontrada ou sem permissão para editar');
        }

        return data[0];
    },

    /**
     * Deleta uma promoção.
     * Filtra por author_id (defesa em profundidade além do RLS).
     * O RLS no Supabase DEVE reforçar isso na policy DELETE de promotions.
     */
    async deletePromotion(promoId) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const { data, error } = await supabaseClient
            .from('promotions')
            .delete()
            .eq('id', promoId)
            .eq('author_id', user.id)
            .select();

        if (error) throw error;

        if (!data || data.length === 0) {
            throw new Error('Promoção não encontrada ou sem permissão');
        }

        return true;
    },

    // ==================== NOVO SISTEMA DE LIKES ====================
    /**
     * Curtir/descurtir promoção (1 like por usuário)
     */
    async toggleLike(promotionId) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Faça login para curtir');

        // Normaliza tipo: no HTML o id vem como string; no DB pode ser number (bigint)
        const promoId = (typeof promotionId === 'string' && /^\d+$/.test(promotionId))
            ? Number(promotionId) : promotionId;

        // Verifica se já curtiu
        const { data: existingLike } = await supabaseClient
            .from('likes')
            .select('id')
            .eq('user_id', user.id)
            .eq('promotion_id', promoId)
            .maybeSingle();

        if (existingLike) {
            // Remove like
            const { error: deleteError } = await supabaseClient
                .from('likes')
                .delete()
                .eq('id', existingLike.id);
            if (deleteError) throw deleteError;

            // Decrementa atomicamente via stored procedure (sem race condition)
            const { data: newCount, error: rpcError } = await supabaseClient
                .rpc('decrement_likes', { promo_id: promoId });
            if (rpcError) throw rpcError;

            return { liked: false, likes_count: newCount ?? 0 };
        } else {
            // Adiciona like
            const { error: insertError } = await supabaseClient
                .from('likes')
                .insert({ user_id: user.id, promotion_id: promoId });
            if (insertError) throw insertError;

            // Incrementa atomicamente via stored procedure (sem race condition)
            const { data: newCount, error: rpcError } = await supabaseClient
                .rpc('increment_likes', { promo_id: promoId });
            if (rpcError) throw rpcError;

            return { liked: true, likes_count: newCount ?? 1 };
        }
    },

    /**
     * Verifica se usuário curtiu uma promoção
     */
    async hasUserLiked(promotionId) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return false;

        const { data } = await supabaseClient
            .from('likes')
            .select('id')
            .eq('user_id', user.id)
            .eq('promotion_id', promotionId)
            .maybeSingle();

        return !!data;
    },

    /**
     * Busca contagem de likes de uma promoção
     */
    async getLikesCount(promotionId) {
        const { count, error } = await supabaseClient
            .from('likes')
            .select('*', { count: 'exact', head: true })
            .eq('promotion_id', promotionId);

        if (error) throw error;
        return count || 0;
    },

    // ==================== COMENTÁRIOS ====================

    /**
     * Lista comentários de uma promoção (com dados do autor)
     */
    async getComments(promotionId) {
        const promoId = (typeof promotionId === 'string' && /^\d+$/.test(promotionId))
            ? Number(promotionId) : promotionId;

        const { data, error } = await supabaseClient
            .from('comments')
            .select(`
                id,
                text,
                created_at,
                user_id,
                author:users(id, name, avatar_url, business_name)
            `)
            .eq('promotion_id', promoId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
    },

    /**
     * Adiciona comentário em uma promoção (usuário logado)
     */
    async addComment(promotionId, text) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Faça login para comentar');

        const trimmed = (text || '').trim();
        if (!trimmed) throw new Error('Digite um comentário');

        const promoId = (typeof promotionId === 'string' && /^\d+$/.test(promotionId))
            ? Number(promotionId) : promotionId;

        const { data, error } = await supabaseClient
            .from('comments')
            .insert([{
                promotion_id: promoId,
                user_id: user.id,
                text: trimmed
            }])
            .select(`
                id,
                text,
                created_at,
                user_id,
                author:users(id, name, avatar_url, business_name)
            `)
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Retorna contagem de comentários por promoção (para vários IDs de uma vez)
     */
    async getCommentCounts(promotionIds) {
        if (!promotionIds || promotionIds.length === 0) return {};

        const ids = promotionIds.map(id =>
            (typeof id === 'string' && /^\d+$/.test(id)) ? Number(id) : id
        );

        const { data, error } = await supabaseClient
            .from('comments')
            .select('promotion_id')
            .in('promotion_id', ids);

        if (error) throw error;

        const counts = {};
        ids.forEach(id => { counts[id] = 0; });
        (data || []).forEach(row => {
            const k = row.promotion_id;
            if (counts[k] !== undefined) counts[k] = (counts[k] || 0) + 1;
        });
        return counts;
    },

    // ==================== FAVORITOS ====================
    
    /**
     * Adiciona/remove promoção dos favoritos do usuário
     */
    async toggleFavorite(promotionId) {
        if (!this._favoritingInProgress) this._favoritingInProgress = new Set();
        const key = String(promotionId);
        if (this._favoritingInProgress.has(key)) throw new Error('Operação em andamento, aguarde.');
        this._favoritingInProgress.add(key);

        try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        // Busca favoritos atuais
        const { data: profile, error: fetchError } = await supabaseClient
            .from(pcUsersTable())
            .select('favorites')
            .eq((typeof pcProfileAuthColumn === 'function' ? pcProfileAuthColumn() : 'id'), user.id)
            .single();

        if (fetchError) throw fetchError;

        let favorites = profile.favorites || [];
        // Normaliza tipo: no HTML o id vem como string; no DB pode vir como number (bigint)
        const id = (typeof promotionId === 'string' && /^\d+$/.test(promotionId))
            ? Number(promotionId) : promotionId;
        const index = favorites.findIndex(f => f === id || String(f) === String(promotionId));
        let isFavorited = false;

        if (index > -1) {
            favorites.splice(index, 1);
        } else {
            favorites.push(id);
            isFavorited = true;
        }

        // Atualiza no banco
        const { error: updateError } = await supabaseClient
            .from(pcUsersTable())
            .update({ favorites })
            .eq((typeof pcProfileAuthColumn === 'function' ? pcProfileAuthColumn() : 'id'), user.id);

        if (updateError) throw updateError;
        return { isFavorited, favorites };
        } finally {
            this._favoritingInProgress.delete(key);
        }
    },

    /**
     * Busca promoções favoritas do usuário
     */
    async getFavorites() {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const { data: profile, error } = await supabaseClient
            .from(pcUsersTable())
            .select('favorites')
            .eq((typeof pcProfileAuthColumn === 'function' ? pcProfileAuthColumn() : 'id'), user.id)
            .single();

        if (error) throw error;
        if (!profile.favorites || profile.favorites.length === 0) return [];

        const { data: promotions, error: promoError } = await supabaseClient
            .from('promotions')
            .select(`
                *,
                author:users(
                    id, 
                    name, 
                    avatar_url, 
                    business_name, 
                    phone, 
                    business_store_link,
                    latitude,
                    longitude
                )
            `)
            .in('id', profile.favorites)
            .order('created_at', { ascending: false });

        if (promoError) throw promoError;
        return promotions;
    },

    // ==================== STORIES ====================
    
    /**
     * Busca stories ativos (não expirados) com dados do autor - Usando horário do servidor com margem
     */
    async getActiveStories() {
        // Obtém o horário do servidor para filtro preciso
        const serverTime = await this.getServerTime();

        // Margem de 10 minutos para cobrir diferença de timezone/relógio
        const serverDate = new Date(serverTime);
        const marginDate = new Date(serverDate.getTime() - 10 * 60 * 1000);

        const { data, error } = await supabaseClient
            .from('stories')
            .select(`
                *,
                author:users(
                    id, 
                    name, 
                    avatar_url, 
                    business_name, 
                    phone, 
                    user_type, 
                    business_store_link,
                    latitude,
                    longitude
                )
            `)
            .gt('expires_at', marginDate.toISOString())
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        // 🔥 FILTRO FINAL NO FRONTEND
        const now = new Date(serverTime);
        return data.filter(story => {
            const expiresAt = new Date(story.expires_at);
            return expiresAt > now;
        });
    },

    /**
     * Cria novo story com campos opcionais
     */
    async createStory(imageUrl, whatsapp = null, caption = null, expiresAt = null) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const expires_at = expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        // IMPORTANTE: NÃO usar .select().single() aqui.
        // Se a tabela "stories" não tiver política SELECT no Supabase,
        // o .select() retorna vazio, o .single() lança PGRST116,
        // e o Supabase DESFAZ o insert inteiro — story nunca é salvo.
        const { error } = await supabaseClient
            .from('stories')
            .insert([{
                author_id: user.id,
                image_url: imageUrl,
                whatsapp: whatsapp,
                caption: caption,
                created_at: new Date().toISOString(),
                expires_at: expires_at
            }]);

        if (error) throw error;
        return true;
    },

    /**
     * Deleta um story
     */
    async deleteStory(storyId) {
        const { data, error } = await supabaseClient
            .from('stories')
            .delete()
            .eq('id', storyId)
            .select();

        if (error) throw error;

        if (!data || data.length === 0) {
            throw new Error('Story não encontrado ou sem permissão');
        }

        return true;
    },

    // ==================== NOTIFICAÇÕES ====================

    async getNotifications(limit = 50) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabaseClient
            .from('notifications')
            .select('id, title, message, action_url, action_label, is_read, created_at, read_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    },

    async getUnreadNotificationsCount() {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return 0;

        const { count, error } = await supabaseClient
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('is_read', false);

        if (error) throw error;
        return count || 0;
    },

    async markNotificationRead(notificationId) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const { data, error } = await supabaseClient
            .from('notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('id', notificationId)
            .eq('user_id', user.id)
            .select()
            .maybeSingle();

        if (error) throw error;
        return data;
    },

    async markAllNotificationsRead() {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const { error } = await supabaseClient
            .from('notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .eq('is_read', false);

        if (error) throw error;
        return true;
    },

    async createNotificationForUser(userId, payload) {
        const { data, error } = await supabaseClient
            .from('notifications')
            .insert([{
                user_id: userId,
                title: payload.title,
                message: payload.message,
                action_url: payload.actionUrl || null,
                action_label: payload.actionLabel || null
            }])
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Insere notificação para um usuário via RPC (contorna RLS - usar para story/promo em massa).
     */
    async insertNotificationRpc(userId, payload) {
        const { data, error } = await supabaseClient.rpc('insert_notification_for_user', {
            p_user_id: userId,
            p_title: payload.title,
            p_message: payload.message,
            p_action_url: payload.actionUrl || null,
            p_action_label: payload.actionLabel || null
        });
        if (error) throw error;
        return data;
    },

    /**
     * Envia push notification para todos via Edge Function do Supabase.
     * Não bloqueia a UI — erro é silencioso.
     */
    async sendPushToAll(title, message, url) {
        try {
            await supabaseClient.functions.invoke('notify-push', {
                body: { title, message, url: url || '' }
            });
        } catch (_) {}
    },

    /**
     * Retorna IDs de todos os usuários exceto o informado (para notificações em massa).
     * Requer política RLS em users que permita SELECT de id para outros usuários.
     */
    async getOtherUserIds(excludeUserId) {
        const authCol = (typeof pcProfileAuthColumn === 'function' ? pcProfileAuthColumn() : 'id');
        const { data, error } = await supabaseClient
            .from(pcUsersTable())
            .select(`id, ${authCol}`)
            .neq(authCol, excludeUserId);
        if (error) {
            return [];
        }
        const ids = (data || []).map(row => row[authCol] || row.id).filter(Boolean);
        return ids;
    },

    /**
     * Notifica todos os outros usuários sobre novo story (chamado após publicar story).
     * Usa chunks para não bloquear a UI com centenas de chamadas simultâneas.
     * ATENÇÃO: não escala para bases com muitos usuários — considere usar
     * uma Edge Function com fila para volumes acima de ~100 usuários.
     */
    async notifyUsersAboutNewStory(authorId, authorName) {
        const userIds = await this.getOtherUserIds(authorId);
        if (!userIds.length) return;
        const title = 'Novo story';
        const message = `${authorName || 'Um comerciante'} publicou um story. Confira no início do feed!`;
        const payload = { title, message, actionUrl: 'promocity://story/' + authorId, actionLabel: 'Ver story' };
        // Push na barra do celular via Edge Function
        this.sendPushToAll(title, message, 'https://wonderful-dodol-b53606.netlify.app').catch(() => {});
        const CHUNK = 10;
        for (let i = 0; i < userIds.length; i += CHUNK) {
            const chunk = userIds.slice(i, i + CHUNK);
            await Promise.all(chunk.map(uid => this.insertNotificationRpc(uid, payload).catch(() => {})));
            if (i + CHUNK < userIds.length) {
                await new Promise(r => setTimeout(r, 150));
            }
        }
    },

    /**
     * Notifica o comerciante sobre novo pedido de entrega.
     */
    async notifyMerchantAboutNewDelivery(merchantId, clientName, promotionTitle) {
        try {
            await this.insertNotificationRpc(merchantId, {
                title: '🛵 Novo pedido de entrega!',
                message: `${clientName || 'Um cliente'} pediu entrega de "${promotionTitle || 'sua promoção'}". Toque para ver.`,
                actionUrl: 'promocity://merchant-orders',
                actionLabel: 'Ver pedidos'
            });
        } catch (e) {
            console.warn('Notificação ao comerciante falhou (não crítico):', e);
        }
    },

    /**
     * Notifica todos os motoboys disponíveis que há uma nova entrega esperando.
     */
    async notifyAvailableMotoboys() {
        try {
            const authCol = (typeof pcProfileAuthColumn === 'function' ? pcProfileAuthColumn() : 'id');
            const { data, error } = await supabaseClient
                .from(pcUsersTable())
                .select(`id, ${authCol}`)
                .eq('is_motoboy', true)
                .eq('motoboy_available', true);
            if (error || !data || data.length === 0) return;
            const currentUserId = (await supabaseClient.auth.getUser()).data?.user?.id;
            for (const u of data) {
                const targetUserId = u[authCol] || u.id;
                if (!targetUserId || targetUserId === currentUserId) continue; // não notifica a si mesmo
                try {
                    await this.insertNotificationRpc(targetUserId, {
                        title: '🛵 Nova entrega disponível!',
                        message: 'Um novo pedido foi aceito pelo comerciante e aguarda motoboy. Toque para ver.',
                        actionUrl: 'promocity://motoboy-dashboard',
                        actionLabel: 'Ver entrega'
                    });
                } catch (_) {}
            }
        } catch (_) {}
    },

    /**
     * Notifica todos os outros usuários sobre nova promoção (chamado após publicar promoção).
     * Usa chunks para não bloquear a UI com centenas de chamadas simultâneas.
     * ATENÇÃO: não escala para bases com muitos usuários — considere usar
     * uma Edge Function com fila para volumes acima de ~100 usuários.
     */
    async notifyUsersAboutNewPromotion(authorId, authorName, promotionTitle, promotionId) {
        const userIds = await this.getOtherUserIds(authorId);
        if (!userIds.length) return;
        const title = 'Nova promoção 🔥';
        const message = `${authorName || 'Uma loja'} publicou: ${promotionTitle || 'Nova oferta'}`;
        const payload = {
            title,
            message,
            actionUrl: promotionId ? 'promocity://promo/' + promotionId : '',
            actionLabel: promotionId ? 'Ver promoção' : ''
        };
        // Push na barra do celular via Edge Function
        const promoUrl = promotionId
            ? `https://wonderful-dodol-b53606.netlify.app?promo=${promotionId}`
            : 'https://wonderful-dodol-b53606.netlify.app';
        this.sendPushToAll(title, message, promoUrl).catch(() => {});
        const CHUNK = 10;
        for (let i = 0; i < userIds.length; i += CHUNK) {
            const chunk = userIds.slice(i, i + CHUNK);
            await Promise.all(chunk.map(uid => this.insertNotificationRpc(uid, payload).catch(() => {})));
            if (i + CHUNK < userIds.length) {
                await new Promise(r => setTimeout(r, 150));
            }
        }
    },

    // ==================== ENTREGAS E MOTOBOYS ====================

    /**
     * Cria pedido de entrega (cliente)
     */
    async createDelivery(data) {
        let { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) {
            const { data: sessionData } = await supabaseClient.auth.getSession();
            user = sessionData?.session?.user ?? null;
        }
        if (!user) throw new Error('Usuário não autenticado');

        // Monta campo notes com pagamento embutido como fallback
        const paymentLabels = { dinheiro: 'Dinheiro', cartao: 'Cartão', pix: 'Pix' };
        let notesWithPayment = data.notes || null;
        if (data.paymentMethod) {
            const pmLabel = paymentLabels[data.paymentMethod] || data.paymentMethod;
            const trocoStr = (data.paymentMethod === 'dinheiro' && data.changeFor)
                ? ` (troco p/ R$${parseFloat(data.changeFor).toFixed(2)})`
                : '';
            const paymentNote = `[Pagamento: ${pmLabel}${trocoStr}]`;
            notesWithPayment = data.notes ? `${paymentNote} ${data.notes}` : paymentNote;
        }

        const baseRow = {
            promotion_id: data.promotionId,
            client_id: user.id,
            merchant_id: data.merchantId,
            status: 'pending_merchant',
            pickup_address: data.pickupAddress,
            pickup_lat: data.pickupLat,
            pickup_lng: data.pickupLng,
            delivery_address: data.deliveryAddress,
            delivery_lat: data.deliveryLat,
            delivery_lng: data.deliveryLng,
            delivery_fee: data.deliveryFee,
            promo_total: data.promoTotal,
            total: data.total,
            client_phone: data.clientPhone,
            client_name: data.clientName,
            notes: notesWithPayment,
            payment_method: data.paymentMethod || null,
            change_for: data.changeFor || null
        };

        let { data: row, error } = await supabaseClient
            .from('deliveries')
            .insert([baseRow])
            .select()
            .single();

        // Se falhar por schema cache desatualizado, retenta sem as novas colunas
        if (error && error.message && error.message.includes('schema cache')) {
            const { payment_method, change_for, ...rowWithoutNewCols } = baseRow;
            const retry = await supabaseClient
                .from('deliveries')
                .insert([rowWithoutNewCols])
                .select()
                .single();
            row = retry.data;
            error = retry.error;
        }

        if (error) throw error;
        return row;
    },

    /**
     * Busca entrega por ID com detalhes (promoção, autor, cliente, motoboy)
     */
    async getDeliveryById(deliveryId) {
        const { data, error } = await supabaseClient
            .from('deliveries')
            .select(`
                *,
                promotion:promotions(id, title, image_url, new_price),
                client:users!client_id(id, name, phone),
                merchant:users!merchant_id(id, name, business_name, phone, business_address, latitude, longitude),
                motoboy:users!motoboy_id(id, name, phone, motoboy_vehicle, motoboy_lat, motoboy_lng, motoboy_updated_at)
            `)
            .eq('id', deliveryId)
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Entregas do cliente (todas as do usuário logado)
     */
    async getDeliveriesForClient() {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabaseClient
            .from('deliveries')
            .select(`
                *,
                promotion:promotions(id, title, image_url, new_price),
                merchant:users!merchant_id(id, business_name, name)
            `)
            .eq('client_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    },

    /**
     * Entregas do comerciante (pedidos para suas promoções)
     */
    async getDeliveriesForMerchant() {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabaseClient
            .from('deliveries')
            .select(`
                *,
                promotion:promotions(id, title, image_url, new_price),
                client:users!client_id(id, name, phone),
                motoboy:users!motoboy_id(id, name, motoboy_vehicle, motoboy_lat, motoboy_lng)
            `)
            .eq('merchant_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    },

    /**
     * Entregas disponíveis para motoboy (status accepted_merchant, sem motoboy, das últimas 48h)
     */
    async getDeliveriesAvailableForMotoboy(userLat, userLng) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return [];

        // Apenas pedidos das últimas 48h — evita acúmulo de pedidos antigos/travados
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabaseClient
            .from('deliveries')
            .select(`
                *,
                promotion:promotions(id, title, new_price),
                merchant:users!merchant_id(id, business_name, business_address, latitude, longitude)
            `)
            .eq('status', 'accepted_merchant')
            .is('motoboy_id', null)
            .gte('created_at', cutoff)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
    },

    /**
     * Entregas em andamento e histórico do motoboy
     */
    async getDeliveriesForMotoboy() {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return { inProgress: [], history: [] };

        const { data, error } = await supabaseClient
            .from('deliveries')
            .select(`
                *,
                promotion:promotions(id, title, image_url, new_price),
                merchant:users!merchant_id(id, business_name, business_address, latitude, longitude),
                client:users!client_id(id, name, phone)
            `)
            .eq('motoboy_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        const list = data || [];
        const inProgress = list.filter(d => !['delivered', 'cancelled', 'rejected_merchant'].includes(d.status));
        const history = list.filter(d => d.status === 'delivered');
        return { inProgress, history, all: list };
    },

    /**
     * Comerciante aceita ou recusa o pedido
     */
    async updateDeliveryMerchantDecision(deliveryId, accept) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const status = accept ? 'accepted_merchant' : 'rejected_merchant';
        const { data, error } = await supabaseClient
            .from('deliveries')
            .update({ status })
            .eq('id', deliveryId)
            .eq('merchant_id', user.id)
            .eq('status', 'pending_merchant')
            .select()
            .single();

        if (error) throw error;
        if (!data) throw new Error('Pedido não encontrado ou já foi respondido');
        return data;
    },

    /**
     * Motoboy aceita a entrega
     */
    async assignMotoboyToDelivery(deliveryId) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const { data, error } = await supabaseClient
            .from('deliveries')
            .update({ motoboy_id: user.id, status: 'waiting_motoboy' })
            .eq('id', deliveryId)
            .eq('status', 'accepted_merchant')
            .is('motoboy_id', null)
            .select()
            .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('Entrega não disponível ou já foi aceita');
        return data;
    },

    /**
     * Atualiza status da entrega (motoboy: picked_up, in_delivery, delivered)
     */
    async updateDeliveryStatus(deliveryId, status) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const { data, error } = await supabaseClient
            .from('deliveries')
            .update({ status })
            .eq('id', deliveryId)
            .eq('motoboy_id', user.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) throw new Error('Entrega não encontrada');
        return data;
    },

    /**
     * Registra localização do motoboy (rastreio em tempo real)
     */
    async insertDeliveryLocation(deliveryId, lat, lng) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const { data, error } = await supabaseClient
            .from('delivery_locations')
            .insert([{ delivery_id: deliveryId, lat, lng }])
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Atualiza posição do motoboy no perfil (para Realtime)
     */
    async updateMotoboyLocation(lat, lng) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const { data, error } = await supabaseClient
            .from(pcUsersTable())
            .update({
                motoboy_lat: lat,
                motoboy_lng: lng,
                motoboy_updated_at: new Date().toISOString()
            })
            .eq((typeof pcProfileAuthColumn === 'function' ? pcProfileAuthColumn() : 'id'), user.id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Últimas posições do rastreio (delivery_locations) para um mapa
     */
    async getDeliveryLocations(deliveryId, limit = 50) {
        const { data, error } = await supabaseClient
            .from('delivery_locations')
            .select('id, lat, lng, created_at')
            .eq('delivery_id', deliveryId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return (data || []).reverse();
    },

    /**
     * Sem WebSocket: não há .channel() neste app. Se precisar de rastreio ao vivo, use getDeliveryLocations em intervalo.
     */
    subscribeDelivery(_deliveryId, _callback) {
        return () => {};
    },

    /**
     * Avaliar entrega (cliente ou comerciante)
     */
    async createDeliveryRating(deliveryId, rating, comment) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const { data, error } = await supabaseClient
            .from('delivery_ratings')
            .insert([{ delivery_id: deliveryId, rater_id: user.id, rating, comment: comment || null }])
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // ==================== DESTAQUES DA LOJA (tabela merchant_highlights) ====================

    normalizeMerchantHighlights(raw) {
        let arr = [];
        if (raw == null) return arr;
        if (Array.isArray(raw)) arr = raw;
        else if (typeof raw === 'string') {
            try {
                const p = JSON.parse(raw);
                arr = Array.isArray(p) ? p : [];
            } catch (_) {
                arr = [];
            }
        } else {
            return arr;
        }
        return arr.slice().sort((a, b) => {
            const ta = new Date(a.created_at || 0).getTime();
            const tb = new Date(b.created_at || 0).getTime();
            return tb - ta;
        });
    },

    async _readHighlightsArray(merchantId) {
        // 1) Tenta primeiro tabela dedicada (fonte compartilhada para todos os usuários)
        const available = await this._isMerchantHighlightsAvailable();
        if (available) {
            const { data, error } = await supabaseClient
                .from(this._highlightsTable())
                .select('id, title, description, image_url, price, created_at, updated_at')
                .eq('merchant_user_id', merchantId)
                .order('created_at', { ascending: false });
            if (!error && Array.isArray(data) && data.length > 0) {
                return this.normalizeMerchantHighlights(data);
            }
            if (error) throw error;
        }

        // 2) Fallback no perfil (legado compartilhado)
        try {
            const row = await this._readProfileRow(merchantId);
            const col = this._resolveProfileHighlightsColumnFromRow(row);
            if (col) {
                if (typeof window !== 'undefined') {
                    window.PROMOCITY_PROFILE_HIGHLIGHTS_COLUMN_RUNTIME = col;
                }
                const profileHighlights = this.normalizeMerchantHighlights(row?.[col]);
                if (profileHighlights.length > 0) return profileHighlights;
            }
        } catch (e) {
            if (!this._isMissingStoreHighlightsColumnError(e)) {
                throw e;
            }
        }

        // 3) Último fallback local (somente no mesmo navegador)
        return this._readHighlightsLocal(merchantId);
    },

    async _writeHighlightsArray(merchantId, arr) {
        const available = await this._isMerchantHighlightsAvailable();
        if (!available) {
            try {
                let col = (typeof window !== 'undefined' && window.PROMOCITY_PROFILE_HIGHLIGHTS_COLUMN_RUNTIME)
                    ? String(window.PROMOCITY_PROFILE_HIGHLIGHTS_COLUMN_RUNTIME)
                    : '';
                if (!col) {
                    const row = await this._readProfileRow(merchantId);
                    col = this._resolveProfileHighlightsColumnFromRow(row) || '';
                    if (col && typeof window !== 'undefined') {
                        window.PROMOCITY_PROFILE_HIGHLIGHTS_COLUMN_RUNTIME = col;
                    }
                }
                if (!col) {
                    this._writeHighlightsLocal(merchantId, arr || []);
                    return;
                }
                const authCol = (typeof pcProfileAuthColumn === 'function' ? pcProfileAuthColumn() : 'id');
                const { error } = await supabaseClient
                    .from(pcUsersTable())
                    .update({ [col]: arr || [] })
                    .eq(authCol, merchantId);
                if (error) {
                    if (this._isMissingStoreHighlightsColumnError(error)) {
                        this._writeHighlightsLocal(merchantId, arr || []);
                        return;
                    }
                    throw error;
                }
                return;
            } catch (e) {
                if (this._isMissingStoreHighlightsColumnError(e)) {
                    this._writeHighlightsLocal(merchantId, arr || []);
                    return;
                }
                throw e;
            }
        }
        const { error: delErr } = await supabaseClient
            .from(this._highlightsTable())
            .delete()
            .eq('merchant_user_id', merchantId);
        if (delErr) throw delErr;
        if (!Array.isArray(arr) || arr.length === 0) return;
        const rows = arr.map((x) => ({
            id: x.id,
            merchant_user_id: merchantId,
            title: x.title,
            description: x.description || null,
            image_url: x.image_url || null,
            price: x.price ?? null,
            created_at: x.created_at || new Date().toISOString(),
            updated_at: x.updated_at || new Date().toISOString()
        }));
        const { error: insErr } = await supabaseClient
            .from(this._highlightsTable())
            .insert(rows);
        if (insErr) throw insErr;
    },

    async getStoreHighlights(merchantId) {
        if (!merchantId) return [];
        try {
            return await this._readHighlightsArray(merchantId);
        } catch (e) {
            const msg = String(e.message || e);
            if (/merchant_highlights|destaques_do_comerciante|table|relation|schema|42P01|PGRST205/i.test(msg)) {
                if (typeof window !== 'undefined') {
                    window.PROMOCITY_MH_AVAILABLE_RUNTIME = false;
                    if (window.localStorage) {
                        window.localStorage.setItem('promocity_mh_available_runtime', 'false');
                    }
                }
                console.warn('[destaques] Tabela de destaques indisponível na API. Verifique o nome real (merchant_highlights ou destaques_do_comerciante).');
            } else {
                console.warn('[destaques] leitura:', e);
            }
            return [];
        }
    },

    async createStoreHighlight(row) {
        const merchantId = row.merchant_id;
        if (!merchantId) throw new Error('merchant_id obrigatório');
        const now = new Date().toISOString();
        const item = {
            id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
            merchant_user_id: merchantId,
            title: row.title,
            description: row.description != null ? row.description : null,
            image_url: row.image_url || null,
            price: row.price != null ? row.price : null,
            created_at: now,
            updated_at: now
        };
        if (!(await this._isMerchantHighlightsAvailable())) {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) throw new Error('Usuário não autenticado');
            if (user.id !== merchantId) throw new Error('Sem permissão para criar destaque');
            const current = await this._readHighlightsArray(merchantId);
            const payloadItem = {
                id: item.id,
                title: item.title,
                description: item.description,
                image_url: item.image_url,
                price: item.price,
                created_at: item.created_at,
                updated_at: item.updated_at
            };
            await this._writeHighlightsArray(merchantId, [payloadItem, ...current]);
            return payloadItem;
        }
        const { data, error } = await supabaseClient
            .from(this._highlightsTable())
            .insert([item])
            .select('id, title, description, image_url, price, created_at, updated_at')
            .single();
        if (error) throw error;
        return data;
    },

    async updateStoreHighlight(id, updates) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');
        const now = new Date().toISOString();
        const payload = {
            title: updates.title,
            description: updates.description != null ? updates.description : null,
            image_url: updates.image_url || null,
            price: updates.price != null ? updates.price : null,
            updated_at: now
        };
        if (!(await this._isMerchantHighlightsAvailable())) {
            const current = await this._readHighlightsArray(user.id);
            const idx = current.findIndex((h) => String(h.id) === String(id));
            if (idx < 0) throw new Error('Destaque não encontrado');
            const next = current.slice();
            next[idx] = { ...next[idx], ...payload };
            await this._writeHighlightsArray(user.id, next);
            return next[idx];
        }
        const { data, error } = await supabaseClient
            .from(this._highlightsTable())
            .update(payload)
            .eq('id', id)
            .eq('merchant_user_id', user.id)
            .select('id, title, description, image_url, price, created_at, updated_at')
            .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Destaque não encontrado');
        return data;
    },

    async deleteStoreHighlight(id) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');
        if (!(await this._isMerchantHighlightsAvailable())) {
            const current = await this._readHighlightsArray(user.id);
            const next = current.filter((h) => String(h.id) !== String(id));
            await this._writeHighlightsArray(user.id, next);
            return;
        }
        const { error } = await supabaseClient
            .from(this._highlightsTable())
            .delete()
            .eq('id', id)
            .eq('merchant_user_id', user.id);
        if (error) throw error;
    },

    // ==================== ESTADO DO USUÁRIO NAS PROMOÇÕES ====================

    /**
     * Retorna os IDs de promoções que o usuário atual curtiu.
     * Usado para marcar isLiked=true ao renderizar o feed.
     */
    async getUserLikedPromoIds(promoIds) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user || !promoIds || !promoIds.length) return [];

        const ids = promoIds.map(id =>
            (typeof id === 'string' && /^\d+$/.test(id)) ? Number(id) : id
        );

        const { data, error } = await supabaseClient
            .from('likes')
            .select('promotion_id')
            .eq('user_id', user.id)
            .in('promotion_id', ids);

        if (error) {
            console.warn('[db] getUserLikedPromoIds erro:', error.message);
            return [];
        }
        return (data || []).map(r => r.promotion_id);
    },

    // ==================== UPLOADS ====================
    
    /**
     * Upload de imagem para Storage
     * No mobile, file.name pode ser vazio ou sem extensão; usa tipo MIME como fallback.
     */
    async uploadImage(file, bucket, folder = '') {
        let ext = 'jpg';
        if (file.name && typeof file.name === 'string') {
            const parts = file.name.split('.');
            if (parts.length > 1 && parts[parts.length - 1]) {
                const e = parts[parts.length - 1].toLowerCase();
                if (['jpg','jpeg','png','gif','webp'].includes(e)) ext = e === 'jpeg' ? 'jpg' : e;
            }
        }
        if (file.type && file.type.startsWith('image/')) {
            const mimeExt = file.type.replace('image/', '');
            if (mimeExt && mimeExt !== 'jpeg') ext = mimeExt; else if (file.type === 'image/jpeg' || file.type === 'image/jpg') ext = 'jpg';
        }
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const filePath = folder ? `${folder}/${fileName}` : fileName;

        const contentType = (file.type && file.type.startsWith('image/')) ? file.type : 'image/jpeg';
        const { data, error } = await supabaseClient
            .storage
            .from(bucket)
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: contentType
            });

        if (error) {
            throw error;
        }

        const { data: { publicUrl } } = supabaseClient
            .storage
            .from(bucket)
            .getPublicUrl(data.path);

        // Verifica se o bucket tem acesso público de leitura.
        // Se retornar erro de rede/403, o bucket provavelmente é privado.
        try {
            const check = await fetch(publicUrl, { method: 'HEAD' });
            if (!check.ok) {
                console.error(
                    `❌ [Storage] Bucket "${bucket}" retornou HTTP ${check.status}.\n` +
                    `📋 SOLUÇÃO: Supabase Dashboard → Storage → "${bucket}" → ` +
                    `Policies → New Policy → SELECT para role "anon" (sem filtro de linha).`
                );
            }
        } catch (headErr) {
            console.error(
                `❌ [Storage] Imagem não acessível (ERR_CONNECTION_CLOSED ou CORS) no bucket "${bucket}".\n` +
                `📋 SOLUÇÃO: Supabase Dashboard → Storage → "${bucket}" → ` +
                `clique "Make Public" OU adicione política SELECT para "anon".`,
                headErr.message
            );
        }

        return publicUrl;
    },

    /**
     * Remove imagem do Storage
     */
    async deleteImage(bucket, path) {
        const { error } = await supabaseClient
            .storage
            .from(bucket)
            .remove([path]);
            
        if (error) throw error;
        return true;
    },

    /**
     * Busca todos os perfis do tipo "merchant" que possuem foto de perfil válida.
     * Usado pela seção "Lojas parceiras" na home.
     */
    async getAllMerchantProfiles(options = {}) {
        const limit = Math.min(Math.max(Number(options.limit) || 80, 1), 200);
        const table = typeof pcUsersTable === 'function' ? pcUsersTable() : 'users';
        const authCol = typeof pcProfileAuthColumn === 'function' ? pcProfileAuthColumn() : 'id';

        try {
            const { data, error } = await supabaseClient
                .from(table)
                .select(`${authCol}, name, business_name, avatar_url, user_type`)
                .eq('user_type', 'merchant')
                .not('avatar_url', 'is', null)
                .limit(limit);

            if (error) throw error;

            return (data || [])
                .filter(row => {
                    const id = row[authCol];
                    const url = (row.avatar_url || '').trim();
                    return id != null && url.length > 0;
                })
                .map(row => ({ ...row, id: row[authCol] }));
        } catch (err) {
            console.warn('[LojasParceiras] Falha ao buscar comerciantes:', err?.message || err);
            return [];
        }
    }
};

// Exportação global
window.db = db;