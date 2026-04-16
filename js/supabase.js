/**
 * CONFIGURAÇÃO SUPABASE - PROMOCITY
 * Cliente Supabase inicializado e pronto para uso
 * VERSÃO CORRIGIDA - Com função para carregar perfil de autor e horário do servidor
 */

// ⚠️ CONFIGURAÇÃO OBRIGATÓRIA
const SUPABASE_URL = 'https://oaxeiiuxkcsdxxzsyvyj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9heGVpaXV4a2NzZHh4enN5dnlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2OTQ1ODAsImV4cCI6MjA4NzI3MDU4MH0.35BvFJIkTFVgUCv2epGcPJyoVlJr40P3pNLHfs1AOpc';

/**
 * Nome da tabela de perfil no schema public (padrão: users).
 * Aceita nomes com acentos/espaços (ex.: "usuários públicos" no Supabase em PT-BR).
 * Defina ANTES de js/supabase.js:
 * <script>window.PROMOCITY_PROFILE_TABLE = 'usuários públicos';</script>
 */
function pcUsersTable() {
    if (typeof window !== 'undefined' && window.PROMOCITY_PROFILE_TABLE_RUNTIME) {
        return String(window.PROMOCITY_PROFILE_TABLE_RUNTIME).trim();
    }
    if (typeof window !== 'undefined' && window.PROMOCITY_PROFILE_TABLE) {
        const t = String(window.PROMOCITY_PROFILE_TABLE).trim();
        if (t.length > 0 && t.length <= 200 && !/["'\\;]/.test(t)) return t;
    }
    return 'users';
}
window.pcUsersTable = pcUsersTable;
function pcProfileAuthColumn() {
    if (typeof window !== 'undefined' && window.PROMOCITY_PROFILE_AUTH_COLUMN_RUNTIME) {
        return String(window.PROMOCITY_PROFILE_AUTH_COLUMN_RUNTIME).trim();
    }
    return 'id';
}
window.pcProfileAuthColumn = pcProfileAuthColumn;

const PC_PROFILE_TABLE_CACHE_KEY = 'promocity_profile_table_runtime';
const PC_PROFILE_AUTH_COLUMN_CACHE_KEY = 'promocity_profile_auth_column_runtime';
const PC_MERCHANT_HIGHLIGHTS_AVAILABLE_CACHE_KEY = 'promocity_mh_available_runtime';
const PC_HIGHLIGHTS_TABLE_CACHE_KEY = 'promocity_highlights_table_runtime';

async function resolveProfileTable() {
    async function canUseProfileTable(tableName) {
        if (!tableName || tableName.length > 200 || /["'\\;]/.test(tableName)) return false;
        try {
            const { error } = await supabaseClientInstance
                .from(tableName)
                .select('id')
                .limit(1);
            return !error;
        } catch (_) {
            return false;
        }
    }

    const preferred = (typeof window !== 'undefined' && window.PROMOCITY_PROFILE_TABLE)
        ? String(window.PROMOCITY_PROFILE_TABLE).trim()
        : '';

    // Se o projeto definiu explicitamente a tabela de perfil no index.html,
    // valida primeiro para evitar travar com um nome inválido.
    if (preferred && await canUseProfileTable(preferred)) {
        if (typeof window !== 'undefined') {
            window.PROMOCITY_PROFILE_TABLE_RUNTIME = preferred;
            if (window.localStorage) {
                window.localStorage.setItem(PC_PROFILE_TABLE_CACHE_KEY, preferred);
            }
        }
        return preferred;
    }

    if (typeof window !== 'undefined' && window.PROMOCITY_PROFILE_TABLE_RUNTIME) {
        return window.PROMOCITY_PROFILE_TABLE_RUNTIME;
    }

    const cached = (typeof window !== 'undefined' && window.localStorage)
        ? window.localStorage.getItem(PC_PROFILE_TABLE_CACHE_KEY)
        : '';
    if (cached && await canUseProfileTable(cached)) {
        if (typeof window !== 'undefined') {
            window.PROMOCITY_PROFILE_TABLE_RUNTIME = cached;
        }
        return cached;
    }

    const candidates = ['users', 'profiles', preferred, 'comercios']
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i);

    for (const tableName of candidates) {
        if (await canUseProfileTable(tableName)) {
                if (typeof window !== 'undefined') {
                    window.PROMOCITY_PROFILE_TABLE_RUNTIME = tableName;
                    if (window.localStorage) {
                        window.localStorage.setItem(PC_PROFILE_TABLE_CACHE_KEY, tableName);
                    }
                }
                return tableName;
        }
    }

    const fallback = preferred || 'users';
    if (typeof window !== 'undefined') {
        window.PROMOCITY_PROFILE_TABLE_RUNTIME = fallback;
        if (window.localStorage) {
            window.localStorage.setItem(PC_PROFILE_TABLE_CACHE_KEY, fallback);
        }
    }
    return fallback;
}
window.resolveProfileTable = resolveProfileTable;

async function resolveProfileAuthColumn() {
    async function canUseAuthCol(tableName, col) {
        try {
            const { error } = await supabaseClientInstance
                .from(tableName)
                .select(col)
                .limit(1);
            return !error;
        } catch (_) {
            return false;
        }
    }

    if (typeof window !== 'undefined' && window.PROMOCITY_PROFILE_AUTH_COLUMN_RUNTIME) {
        const rt = window.PROMOCITY_PROFILE_AUTH_COLUMN_RUNTIME;
        const tableName = await resolveProfileTable();
        if (rt === 'id' || rt === 'user_id') {
            if (await canUseAuthCol(tableName, rt)) return rt;
        }
    }

    const cached = (typeof window !== 'undefined' && window.localStorage)
        ? window.localStorage.getItem(PC_PROFILE_AUTH_COLUMN_CACHE_KEY)
        : '';
    const tableName = await resolveProfileTable();
    if (cached === 'id' || cached === 'user_id') {
        if (await canUseAuthCol(tableName, cached)) {
            if (typeof window !== 'undefined') {
                window.PROMOCITY_PROFILE_AUTH_COLUMN_RUNTIME = cached;
            }
            return cached;
        }
    }

    // Prioriza "id" para evitar 400 em projetos que não têm "user_id".
    const candidates = ['id', 'user_id'];
    for (const col of candidates) {
        try {
            const { error } = await supabaseClientInstance
                .from(tableName)
                .select(col)
                .limit(1);
            if (!error) {
                if (typeof window !== 'undefined') {
                    window.PROMOCITY_PROFILE_AUTH_COLUMN_RUNTIME = col;
                    if (window.localStorage) {
                        window.localStorage.setItem(PC_PROFILE_AUTH_COLUMN_CACHE_KEY, col);
                    }
                }
                return col;
            }
        } catch (_) {}
    }

    if (typeof window !== 'undefined') {
        window.PROMOCITY_PROFILE_AUTH_COLUMN_RUNTIME = 'id';
        if (window.localStorage) {
            window.localStorage.setItem(PC_PROFILE_AUTH_COLUMN_CACHE_KEY, 'id');
        }
    }
    return 'id';
}
window.resolveProfileAuthColumn = resolveProfileAuthColumn;

function pcHighlightsTable() {
    if (typeof window !== 'undefined' && window.PROMOCITY_HIGHLIGHTS_TABLE_RUNTIME) {
        return String(window.PROMOCITY_HIGHLIGHTS_TABLE_RUNTIME).trim();
    }
    if (typeof window !== 'undefined' && window.PROMOCITY_HIGHLIGHTS_TABLE) {
        const t = String(window.PROMOCITY_HIGHLIGHTS_TABLE).trim();
        if (t.length > 0 && t.length <= 200 && !/["'\\;]/.test(t)) return t;
    }
    return 'merchant_highlights';
}
window.pcHighlightsTable = pcHighlightsTable;

async function resolveHighlightsTable(force = false) {
    const LEGACY_HIGHLIGHTS_TABLE = 'destaques_do_comerciante';

    async function canUseHighlightsTable(tableName) {
        if (!tableName || tableName.length > 200 || /["'\\;]/.test(tableName)) return false;
        try {
            const { error } = await supabaseClientInstance
                .from(tableName)
                .select('id')
                .limit(1);
            return !error;
        } catch (_) {
            return false;
        }
    }

    const preferred = (typeof window !== 'undefined' && window.PROMOCITY_HIGHLIGHTS_TABLE)
        ? String(window.PROMOCITY_HIGHLIGHTS_TABLE).trim()
        : '';

    if (!force && preferred && await canUseHighlightsTable(preferred)) {
        if (typeof window !== 'undefined') {
            window.PROMOCITY_HIGHLIGHTS_TABLE_RUNTIME = preferred;
            if (window.localStorage) {
                window.localStorage.setItem(PC_HIGHLIGHTS_TABLE_CACHE_KEY, preferred);
            }
        }
        return preferred;
    }

    if (!force && typeof window !== 'undefined' && window.PROMOCITY_HIGHLIGHTS_TABLE_RUNTIME) {
        const rt = String(window.PROMOCITY_HIGHLIGHTS_TABLE_RUNTIME).trim();
        const runtimeAllowed = rt !== LEGACY_HIGHLIGHTS_TABLE || preferred === LEGACY_HIGHLIGHTS_TABLE;
        if (runtimeAllowed && await canUseHighlightsTable(rt)) return rt;
    }

    const cached = (!force && typeof window !== 'undefined' && window.localStorage)
        ? window.localStorage.getItem(PC_HIGHLIGHTS_TABLE_CACHE_KEY)
        : '';
    const cachedAllowed = cached && (cached !== LEGACY_HIGHLIGHTS_TABLE || preferred === LEGACY_HIGHLIGHTS_TABLE);
    if (cachedAllowed && await canUseHighlightsTable(cached)) {
        if (typeof window !== 'undefined') {
            window.PROMOCITY_HIGHLIGHTS_TABLE_RUNTIME = cached;
        }
        return cached;
    }

    const candidates = [
        preferred,
        'merchant_highlights',
        // Só tenta tabela legada quando explicitamente configurada.
        preferred === LEGACY_HIGHLIGHTS_TABLE ? LEGACY_HIGHLIGHTS_TABLE : ''
    ]
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i);
    for (const tableName of candidates) {
        if (await canUseHighlightsTable(tableName)) {
            if (typeof window !== 'undefined') {
                window.PROMOCITY_HIGHLIGHTS_TABLE_RUNTIME = tableName;
                if (window.localStorage) {
                    window.localStorage.setItem(PC_HIGHLIGHTS_TABLE_CACHE_KEY, tableName);
                }
            }
            return tableName;
        }
    }

    return '';
}
window.resolveHighlightsTable = resolveHighlightsTable;

async function resolveMerchantHighlightsAvailability(force = false) {
    if (!force && typeof window !== 'undefined' && typeof window.PROMOCITY_MH_AVAILABLE_RUNTIME === 'boolean') {
        return window.PROMOCITY_MH_AVAILABLE_RUNTIME;
    }

    const cached = (!force && typeof window !== 'undefined' && window.localStorage)
        ? window.localStorage.getItem(PC_MERCHANT_HIGHLIGHTS_AVAILABLE_CACHE_KEY)
        : '';
    if (!force && (cached === 'true' || cached === 'false')) {
        const val = cached === 'true';
        if (typeof window !== 'undefined') window.PROMOCITY_MH_AVAILABLE_RUNTIME = val;
        return val;
    }

    try {
        const tableName = await resolveHighlightsTable(force);
        const available = !!tableName;
        if (typeof window !== 'undefined') {
            window.PROMOCITY_MH_AVAILABLE_RUNTIME = available;
            if (window.localStorage) {
                window.localStorage.setItem(PC_MERCHANT_HIGHLIGHTS_AVAILABLE_CACHE_KEY, String(available));
            }
        }
        return available;
    } catch (_) {
        if (typeof window !== 'undefined') {
            window.PROMOCITY_MH_AVAILABLE_RUNTIME = false;
            if (window.localStorage) {
                window.localStorage.setItem(PC_MERCHANT_HIGHLIGHTS_AVAILABLE_CACHE_KEY, 'false');
            }
        }
        return false;
    }
}
window.resolveMerchantHighlightsAvailability = resolveMerchantHighlightsAvailability;

// Inicialização do cliente Supabase (variável renomeada para evitar conflitos)
let supabaseClientInstance;

try {
    supabaseClientInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
            storage: window.localStorage
        },
        db: {
            schema: 'public'
        },
        global: {
            headers: {
                'x-application-name': 'promocity'
            }
        }
        // Realtime (WebSocket) desligado no app: evita erros de conexão e reconexão;
        // feed e notificações usam fetch + polling (ver app.js).
    });
    
    if (window.PROMOCITY_DEBUG) console.log('✅ Supabase inicializado com sucesso');;
} catch (error) {
    console.error('❌ Erro ao inicializar Supabase:', error);
    throw new Error('Falha na conexão com Supabase. Verifique as credenciais.');
}

// Verificação de conexão (Auth API — não depende da tabela de perfil existir no PostgREST)
const checkConnection = async () => {
    try {
        const { error } = await supabaseClientInstance.auth.getSession();
        if (error) throw error;
        await resolveProfileTable();
        await resolveProfileAuthColumn();
        await resolveMerchantHighlightsAvailability(true);
        return true;
    } catch (error) {
        console.error('Erro de conexão:', error);
        return false;
    }
};

// NOVA FUNÇÃO: Obter horário do servidor (para o mapa e validade das promoções)
const getServerTime = async () => {
    try {
        const { data, error } = await supabaseClientInstance.rpc('get_server_time');
        if (error) {
            console.warn('Erro ao obter horário do servidor, usando horário local:', error);
            return new Date().toISOString();
        }
        if (window.PROMOCITY_DEBUG) console.log('🕐 Horário do servidor:', data);
        return data;
    } catch (error) {
        console.warn('Erro na RPC, usando horário local:', error);
        return new Date().toISOString();
    }
};

// Função para carregar perfil de um autor específico
const loadAuthorProfile = async (authorId) => {
    try {
        // Busca dados do usuário
        const { data: user, error: userError } = await supabaseClientInstance
            .from(pcUsersTable())
            .select('*')
            .eq(pcProfileAuthColumn(), authorId)
            .single();
            
        if (userError) throw userError;
        
        // Busca promoções ativas deste autor (usando horário do servidor)
        const serverTime = await getServerTime();
        
        const { data: promotions, error: promoError } = await supabaseClientInstance
            .from('promotions')
            .select('*')
            .eq('author_id', authorId)
            .gt('expires_at', serverTime)
            .order('created_at', { ascending: false });
            
        if (promoError) throw promoError;
        
        // Busca stories ativos deste autor
        const { data: stories, error: storyError } = await supabaseClientInstance
            .from('stories')
            .select('*')
            .eq('author_id', authorId)
            .gt('expires_at', serverTime)
            .order('created_at', { ascending: false });
            
        if (storyError) throw storyError;

        // Busca destaques da loja usando a mesma estratégia de fallback do db
        let highlights = [];
        if (typeof window !== 'undefined' && window.db && typeof window.db.getStoreHighlights === 'function') {
            highlights = await window.db.getStoreHighlights(authorId);
        } else {
            const hasHighlights = await resolveMerchantHighlightsAvailability();
            if (hasHighlights) {
                const { data: hData, error: highlightsError } = await supabaseClientInstance
                    .from(pcHighlightsTable())
                    .select('id, title, description, image_url, price, created_at, updated_at')
                    .eq('merchant_user_id', authorId)
                    .order('created_at', { ascending: false });
                if (highlightsError) throw highlightsError;
                highlights = hData || [];
            }
        }
        
        return {
            profile: user,
            promotions: promotions || [],
            stories: stories || [],
            store_highlights: highlights,
            promotions_count: promotions?.length || 0,
            stories_count: stories?.length || 0
        };
    } catch (error) {
        console.error('Erro ao carregar perfil do autor:', error);
        return null;
    }
};

// Exportação global
window.supabaseClient = supabaseClientInstance;
window.checkSupabaseConnection = checkConnection;
window.getServerTime = getServerTime; // NOVA função exportada
window.loadAuthorProfile = loadAuthorProfile;