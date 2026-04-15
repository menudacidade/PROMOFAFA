/**
 * GERENCIAMENTO DE ENDEREÇO / CIDADE - PROMOCITY
 * Integração com ViaCEP + Nominatim (OpenStreetMap — gratuito, sem API key)
 * Filtro de feed por raio de distância usando utils.getDistanceKm (Haversine)
 *
 * ARQUIVO NOVO — não altera app.js, auth.js nem database.js.
 * Depende de: utils.js, supabase.js (já carregados antes deste arquivo)
 *
 * Exporta: window.addressManager
 *
 * Eventos customizados disparados (escutar em app.js):
 *   - 'promocity:cityChanged'  → detail: { cep, city, state, lat, lng }
 *   - 'promocity:cityCleared'  → detail: null
 */

const addressManager = {

    // ==================== CONSTANTES ====================

    _STORAGE_KEY:        'promocity_user_city_v1',
    _VIACEP_BASE:        'https://viacep.com.br/ws/',
    _NOMINATIM_BASE:     'https://nominatim.openstreetmap.org/search',
    _NOMINATIM_UA:       'PromocityApp/1.0 (app local Ivaí-PR; contato: admin@promocity.app)',
    _NOMINATIM_DELAY_MS: 1100,   // Nominatim exige máx 1 req/s por Termos de Uso
    _DEFAULT_RADIUS_KM:  50,     // Raio padrão do filtro do feed
    _lastNominatimCall:  0,

    // ==================== FORMATAÇÃO DE CEP ====================

    /**
     * Aplica máscara "XXXXX-XXX" a um CEP enquanto o usuário digita.
     * @param {string} raw - Dígitos já extraídos (sem máscara)
     * @returns {string}
     */
    formatCep(raw) {
        const d = String(raw || '').replace(/\D/g, '').slice(0, 8);
        return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
    },

    /**
     * Remove máscara do CEP e retorna apenas os 8 dígitos.
     * @param {string} cep
     * @returns {string}
     */
    cleanCep(cep) {
        return String(cep || '').replace(/\D/g, '');
    },

    // ==================== VIA CEP ====================

    /**
     * Consulta a API gratuita ViaCEP e retorna dados estruturados.
     * @param {string} cep - CEP com ou sem máscara
     * @returns {Promise<{ cep, street, neighborhood, city, state, ibge }>}
     */
    async fetchCep(cep) {
        const clean = this.cleanCep(cep);
        if (clean.length !== 8) {
            throw new Error('CEP inválido. Informe os 8 dígitos.');
        }

        let response;
        try {
            response = await fetch(`${this._VIACEP_BASE}${clean}/json/`, {
                method: 'GET',
                headers: { Accept: 'application/json' },
            });
        } catch (_) {
            throw new Error('Sem conexão. Verifique sua internet e tente novamente.');
        }

        if (!response.ok) {
            throw new Error(`Serviço de CEP indisponível (${response.status}). Tente novamente.`);
        }

        const data = await response.json();

        if (data.erro) {
            throw new Error('CEP não encontrado. Verifique e tente novamente.');
        }

        return {
            cep:          data.cep,           // "86290-000"
            street:       data.logradouro,
            neighborhood: data.bairro,
            city:         data.localidade,    // "Ivaí"
            state:        data.uf,            // "PR"
            ibge:         data.ibge,
        };
    },

    // ==================== NOMINATIM (GEOCODING) ====================

    /**
     * Aguarda o intervalo mínimo exigido pelo Nominatim entre requisições.
     * @private
     */
    async _throttleNominatim() {
        const elapsed = Date.now() - this._lastNominatimCall;
        if (elapsed < this._NOMINATIM_DELAY_MS) {
            await new Promise(r => setTimeout(r, this._NOMINATIM_DELAY_MS - elapsed));
        }
        this._lastNominatimCall = Date.now();
    },

    /**
     * Geocodifica cidade + estado para lat/lng via Nominatim (OpenStreetMap).
     * Respeita o limite de 1 req/s dos Termos de Uso.
     * @param {string} city  - Nome da cidade (ex: "Ivaí")
     * @param {string} state - UF (ex: "PR")
     * @returns {Promise<{ lat: number, lng: number }>}
     */
    async geocodeCity(city, state) {
        if (!city) throw new Error('Nome da cidade é obrigatório para geocoding.');

        await this._throttleNominatim();

        const params = new URLSearchParams({
            q:            `${city}, ${state}, Brasil`,
            format:       'json',
            limit:        '1',
            countrycodes: 'br',
            addressdetails: '0',
        });

        let response;
        try {
            response = await fetch(`${this._NOMINATIM_BASE}?${params}`, {
                method: 'GET',
                headers: {
                    Accept:      'application/json',
                    'User-Agent': this._NOMINATIM_UA,
                },
            });
        } catch (_) {
            throw new Error('Sem conexão ao geocodificar cidade. Tente novamente.');
        }

        if (!response.ok) {
            throw new Error(`Geocoding indisponível (${response.status}). Tente novamente.`);
        }

        const results = await response.json();

        if (!Array.isArray(results) || results.length === 0) {
            throw new Error(`Cidade "${city} - ${state}" não localizada. Confira o CEP.`);
        }

        return {
            lat: parseFloat(results[0].lat),
            lng: parseFloat(results[0].lon),
        };
    },

    // ==================== FLUXO PRINCIPAL ====================

    /**
     * Fluxo completo: CEP → dados do endereço → coordenadas da cidade.
     * Uma única chamada pública para obter tudo que o app precisa.
     * @param {string} cep
     * @returns {Promise<{ cep, city, state, lat, lng }>}
     */
    async resolveFromCep(cep) {
        const address = await this.fetchCep(cep);
        const coords  = await this.geocodeCity(address.city, address.state);
        return {
            cep:   address.cep,
            city:  address.city,
            state: address.state,
            lat:   coords.lat,
            lng:   coords.lng,
        };
    },

    // ==================== PERSISTÊNCIA LOCAL (localStorage) ====================

    /**
     * Salva preferência de cidade no localStorage.
     * @param {{ cep, city, state, lat, lng }} cityData
     */
    saveCityLocal(cityData) {
        try {
            localStorage.setItem(this._STORAGE_KEY, JSON.stringify({
                ...cityData,
                savedAt: new Date().toISOString(),
            }));
        } catch (e) {
            console.warn('[address] Falha ao salvar no localStorage:', e?.message);
        }
    },

    /**
     * Lê a preferência de cidade salva localmente.
     * @returns {{ cep, city, state, lat, lng, savedAt } | null}
     */
    getCityPreference() {
        try {
            const raw = localStorage.getItem(this._STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    },

    /**
     * Remove a preferência de cidade (usar no logout).
     */
    clearCityPreference() {
        try {
            localStorage.removeItem(this._STORAGE_KEY);
        } catch (_) {}
    },

    /**
     * Retorna true se o usuário já tem cidade configurada com coordenadas.
     * @returns {boolean}
     */
    hasCity() {
        const p = this.getCityPreference();
        return !!(p && p.city && typeof p.lat === 'number' && typeof p.lng === 'number');
    },

    // ==================== PERSISTÊNCIA NO SUPABASE ====================

    /**
     * Grava os dados de cidade no perfil do usuário no Supabase.
     * Segue o mesmo padrão defensivo de database.js: remove colunas ausentes
     * no schema caso o Supabase retorne erro 42703/PGRST204.
     *
     * Requer que auth.currentUser e supabaseClient estejam disponíveis.
     * @param {{ cep, city, state, lat, lng }} cityData
     */
    async saveCityToProfile(cityData) {
        if (typeof auth === 'undefined' || !auth.currentUser) {
            throw new Error('Usuário não autenticado.');
        }
        if (typeof supabaseClient === 'undefined') {
            throw new Error('Supabase não inicializado.');
        }

        const userId   = auth.currentUser.id;
        const table    = (typeof pcUsersTable === 'function')        ? pcUsersTable()        : 'users';
        const authCol  = (typeof pcProfileAuthColumn === 'function') ? pcProfileAuthColumn() : 'id';

        // Somente campos que queremos persistir no perfil
        let payload = {
            cep:       cityData.cep   || null,
            city:      cityData.city  || null,
            state:     cityData.state || null,
            latitude:  cityData.lat   != null ? parseFloat(cityData.lat) : null,
            longitude: cityData.lng   != null ? parseFloat(cityData.lng) : null,
        };

        // Loop defensivo: remove colunas que não existem no schema (mesmo padrão de db.updateUserProfile)
        for (let attempt = 0; attempt < 6; attempt++) {
            const { error } = await supabaseClient
                .from(table)
                .update(payload)
                .eq(authCol, userId);

            if (!error) {
                // Atualiza cache em memória para não precisar recarregar
                if (auth.currentUser.profile) {
                    Object.assign(auth.currentUser.profile, payload);
                }
                return;
            }

            const msg = String(error?.message || '').toLowerCase();
            const isColumnErr =
                error?.code === '42703' ||
                error?.code === 'PGRST204' ||
                /column|does not exist|schema cache/i.test(msg);

            if (!isColumnErr) throw error;

            // Extrai o nome da coluna faltante a partir da mensagem de erro
            const match = String(error?.message || '').match(
                /Could not find the ['"]?([a-zA-Z_][a-zA-Z0-9_]*)['"]? column|column ['"]?([a-zA-Z_][a-zA-Z0-9_]*)['"]?/i
            );
            const missingCol = match ? (match[1] || match[2]) : null;

            if (missingCol && Object.prototype.hasOwnProperty.call(payload, missingCol)) {
                console.warn(`[address] Coluna '${missingCol}' não existe no schema, removendo e retentando.`);
                delete payload[missingCol];
            } else {
                throw error;
            }
        }

        throw new Error('Não foi possível salvar a cidade no perfil. Execute a migration SQL primeiro.');
    },

    /**
     * Ponto de entrada principal para salvar cidade:
     * grava localmente SEMPRE; tenta gravar no Supabase (falha silenciosa se
     * a migration ainda não foi rodada — dados ficam no localStorage).
     * @param {{ cep, city, state, lat, lng }} cityData
     */
    async saveCity(cityData) {
        this.saveCityLocal(cityData);

        try {
            await this.saveCityToProfile(cityData);
            console.log('✅ [address] Cidade salva no Supabase:', cityData.city, cityData.state);
        } catch (err) {
            console.warn(
                '[address] Cidade salva apenas no localStorage (execute a migration SQL para persistir no Supabase):',
                err?.message || err
            );
        }
    },

    // ==================== FILTRO DO FEED ====================

    /**
     * Filtra lista de promoções por raio de distância em relação à cidade do usuário.
     *
     * Usa utils.getDistanceKm (Haversine) já presente em utils.js.
     * Coordenadas são lidas de promo.author.latitude / promo.author.longitude,
     * que já vêm no join de db.getPromotions() sem necessidade de alterações.
     *
     * Promoções sem coordenadas são INCLUÍDAS (não bloqueadas) — comportamento
     * conservador para não sumir com promoções de comerciantes sem lat/lng.
     *
     * @param {Array}  promotions - Lista retornada por db.getPromotions()
     * @param {number} userLat    - Latitude da cidade do usuário
     * @param {number} userLng    - Longitude da cidade do usuário
     * @param {number} [radiusKm] - Raio em km (padrão: this._DEFAULT_RADIUS_KM)
     * @returns {Array} Promoções filtradas, ordenadas por distância (mais perto primeiro)
     */
    filterPromotionsByCity(promotions, userLat, userLng, radiusKm) {
        if (!Array.isArray(promotions)) return [];

        const radius       = Number(radiusKm) > 0 ? Number(radiusKm) : this._DEFAULT_RADIUS_KM;
        const distanceFn   = (typeof utils !== 'undefined' && utils.getDistanceKm)
            ? (a, b, c, d) => utils.getDistanceKm(a, b, c, d)
            : this._haversineFallback.bind(this);

        const tagged = promotions.map(promo => {
            // Tenta pegar coordenadas do autor (join) ou da própria promoção (futuro campo)
            const lat = parseFloat(
                promo.author?.latitude  ?? promo.lat ?? promo.latitude  ?? NaN
            );
            const lng = parseFloat(
                promo.author?.longitude ?? promo.lng ?? promo.longitude ?? NaN
            );

            if (isNaN(lat) || isNaN(lng)) {
                return { ...promo, _distanceKm: null }; // sem coords: passa pelo filtro
            }

            return { ...promo, _distanceKm: distanceFn(userLat, userLng, lat, lng) };
        });

        const filtered = tagged.filter(
            p => p._distanceKm === null || p._distanceKm <= radius
        );

        // Ordena: mais perto primeiro; sem coordenadas vão para o final
        filtered.sort((a, b) => {
            if (a._distanceKm === null && b._distanceKm === null) return 0;
            if (a._distanceKm === null) return 1;
            if (b._distanceKm === null) return -1;
            return a._distanceKm - b._distanceKm;
        });

        return filtered;
    },

    /**
     * Wrapper conveniente: lê a preferência de cidade salva e aplica o filtro.
     * Use em app.js no lugar de passar os dados manualmente.
     *
     * @param {Array} promotions
     * @returns {Array} Promotions filtradas (ou a lista original se sem cidade)
     */
    applyFeedFilter(promotions) {
        const pref = this.getCityPreference();
        if (!pref || typeof pref.lat !== 'number' || typeof pref.lng !== 'number') {
            return promotions; // filtro desativado: retorna tudo
        }
        const result = this.filterPromotionsByCity(promotions, pref.lat, pref.lng);
        console.log(
            `🏙️ [address] Filtro de cidade ativo: ${pref.city}-${pref.state}`,
            `| ${result.length}/${promotions.length} promoções dentro de ${this._DEFAULT_RADIUS_KM}km`
        );
        return result;
    },

    /**
     * Fallback interno de Haversine caso utils.js não esteja carregado.
     * Em condições normais utils.getDistanceKm é usado.
     * @private
     */
    _haversineFallback(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const toRad = d => (d * Math.PI) / 180;
        const dLat  = toRad(lat2 - lat1);
        const dLng  = toRad(lng2 - lng1);
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },

    // ==================== HELPERS DE UI ====================

    /**
     * Abre o modal de configuração de cidade.
     */
    openCityModal() {
        const modal = document.getElementById('city-setup-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        // Foca no input após a transição CSS
        const input = document.getElementById('city-cep-input');
        if (input) setTimeout(() => input.focus(), 150);
    },

    /**
     * Fecha o modal de configuração de cidade.
     */
    closeCityModal() {
        const modal = document.getElementById('city-setup-modal');
        if (modal) modal.classList.add('hidden');
    },

    /**
     * Verifica se deve exibir o modal de cidade (primeiro acesso sem cidade salva).
     * Chame logo após login bem-sucedido.
     */
    checkAndPromptCity() {
        if (!this.hasCity()) {
            setTimeout(() => this.openCityModal(), 900);
        }
    },

    /**
     * Exibe a cidade atual no chip do header/feed (se o elemento existir).
     * Elemento: <span id="city-display-label"> no HTML.
     */
    updateCityDisplay() {
        const el = document.getElementById('city-display-label');
        if (!el) return;
        const pref = this.getCityPreference();
        if (pref && pref.city) {
            el.textContent = `📍 ${pref.city} - ${pref.state}`;
            el.classList.remove('hidden');
        } else {
            el.textContent = '📍 Definir cidade';
            el.classList.remove('hidden');
        }
    },

    // ==================== INICIALIZAÇÃO ====================

    /**
     * Inicializa o módulo: registra todos os event listeners do modal de cidade.
     * Chame UMA VEZ, após o DOM estar pronto (ex: no DOMContentLoaded, antes de app.init).
     */
    init() {
        const form      = document.getElementById('city-setup-form');
        const input     = document.getElementById('city-cep-input');
        const skipBtn   = document.getElementById('city-setup-skip');
        const closeBtn  = document.getElementById('city-setup-close');
        const changeBtn = document.getElementById('city-change-btn');

        if (!form) {
            console.warn('[address] Modal de cidade não encontrado no DOM. Cole o HTML do modal em index.html.');
            return;
        }

        // Máscara de CEP em tempo real
        if (input) {
            input.addEventListener('input', e => {
                const raw = e.target.value.replace(/\D/g, '').slice(0, 8);
                e.target.value = this.formatCep(raw);
            });

            // Busca automática ao completar 8 dígitos
            input.addEventListener('input', utils?.debounce
                ? utils.debounce(e => {
                    if (this.cleanCep(e.target.value).length === 8) {
                        this._triggerCepPreview();
                    }
                }, 600)
                : () => {}
            );
        }

        form.addEventListener('submit', async e => {
            e.preventDefault();
            await this._handleFormSubmit();
        });

        if (skipBtn) {
            skipBtn.addEventListener('click', () => this.closeCityModal());
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeCityModal());
        }

        // Botão "Mudar cidade" no feed/perfil (opcional)
        if (changeBtn) {
            changeBtn.addEventListener('click', () => this.openCityModal());
        }

        // Fecha o modal ao clicar no overlay (fora do card)
        const modal = document.getElementById('city-setup-modal');
        if (modal) {
            modal.addEventListener('click', e => {
                if (e.target === modal) this.closeCityModal();
            });
        }

        // Exibe cidade atual se já existir
        this.updateCityDisplay();

        console.log('✅ addressManager inicializado');
    },

    // ==================== HANDLERS INTERNOS ====================

    /**
     * Pré-visualização da cidade enquanto digita (busca CEP em background).
     * @private
     */
    async _triggerCepPreview() {
        const input    = document.getElementById('city-cep-input');
        const feedback = document.getElementById('city-setup-feedback');
        const cep = this.cleanCep(input?.value || '');
        if (cep.length !== 8 || !feedback) return;

        try {
            feedback.textContent = 'Buscando...';
            feedback.className   = 'city-feedback city-feedback--loading';
            const addr = await this.fetchCep(cep);
            feedback.textContent = `Cidade: ${addr.city} - ${addr.state}`;
            feedback.className   = 'city-feedback city-feedback--info';
        } catch (_) {
            feedback.textContent = '';
            feedback.className   = 'city-feedback';
        }
    },

    /**
     * Lida com o submit do formulário de cidade (CEP → resolveFromCep → saveCity).
     * @private
     */
    async _handleFormSubmit() {
        const input     = document.getElementById('city-cep-input');
        const submitBtn = document.getElementById('city-setup-submit');
        const feedback  = document.getElementById('city-setup-feedback');

        const cep = this.cleanCep(input?.value || '');

        if (cep.length !== 8) {
            this._setFeedback(feedback, 'Digite um CEP válido com 8 dígitos.', 'error');
            return;
        }

        // Estado de carregamento
        if (submitBtn) {
            submitBtn.disabled   = true;
            submitBtn.innerHTML  = '<i class="fas fa-spinner fa-spin"></i> Buscando...';
        }
        this._setFeedback(feedback, '', '');

        try {
            const cityData = await this.resolveFromCep(cep);

            this._setFeedback(
                feedback,
                `✅ ${cityData.city} - ${cityData.state} identificada!`,
                'success'
            );

            await this.saveCity(cityData);
            this.updateCityDisplay();

            // Aguarda o usuário ver a confirmação antes de fechar
            setTimeout(() => {
                this.closeCityModal();

                // Evento customizado: app.js pode escutar sem ser modificado
                document.dispatchEvent(new CustomEvent('promocity:cityChanged', {
                    detail: cityData,
                    bubbles: true,
                }));

                // Limpa o formulário para a próxima abertura
                if (input)    input.value = '';
                this._setFeedback(feedback, '', '');

            }, 1400);

        } catch (err) {
            this._setFeedback(feedback, err.message || 'Erro ao buscar CEP. Tente novamente.', 'error');
            console.error('[address] Erro no submit:', err);
        } finally {
            if (submitBtn) {
                submitBtn.disabled  = false;
                submitBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i> Confirmar cidade';
            }
        }
    },

    /**
     * Utilitário: atualiza o elemento de feedback do formulário.
     * @private
     */
    _setFeedback(el, message, type) {
        if (!el) return;
        el.textContent = message;
        el.className   = ['city-feedback', type ? `city-feedback--${type}` : '']
            .filter(Boolean).join(' ');
    },
};

// Exportação global — mesmo padrão de auth.js / database.js
window.addressManager = addressManager;
