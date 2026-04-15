-- =============================================================================
-- PROMOCITY — Migration: Sistema de Geolocalização por Cidade
-- =============================================================================
-- Execute este script NO SQL EDITOR DO SUPABASE (painel → SQL Editor → New Query).
-- Pode ser executado mais de uma vez com segurança (IF NOT EXISTS / IF NOT EXISTS).
--
-- O que este script faz:
--   1. Adiciona colunas de cidade/CEP na tabela 'users'
--   2. Adiciona colunas de cidade na tabela 'promotions' (filtro server-side futuro)
--   3. Cria a tabela 'addresses' (endereços de entrega detalhados por usuário)
--   4. Cria índices para performance
--   5. Habilita RLS e cria políticas na tabela 'addresses'
--   6. Cria trigger de updated_at automático
-- =============================================================================


-- =============================================================================
-- PARTE 1 — Tabela USERS: adicionar campos de cidade e CEP
-- =============================================================================

-- CEP do usuário (formato "XXXXX-XXX")
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS cep   VARCHAR(9);

-- Cidade do usuário (ex: "Ivaí")
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS city  VARCHAR(100);

-- Estado do usuário (UF, ex: "PR")
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS state VARCHAR(2);

-- Observação: as colunas latitude e longitude JÁ EXISTEM na tabela users
-- (confirmado em database.js → createUserProfile). Não são criadas aqui.
-- Se por algum motivo não existirem no seu schema, descomente as linhas abaixo:
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Índice para buscas por cidade (filtro server-side de promoções no futuro)
CREATE INDEX IF NOT EXISTS idx_users_city
    ON public.users (city);


-- =============================================================================
-- PARTE 2 — Tabela PROMOTIONS: adicionar campos de cidade
-- =============================================================================
-- Permite filtro server-side futuro sem join na tabela users.
-- Por enquanto o filtro é feito client-side via author.latitude/longitude.

ALTER TABLE public.promotions
    ADD COLUMN IF NOT EXISTS city  VARCHAR(100);

ALTER TABLE public.promotions
    ADD COLUMN IF NOT EXISTS state VARCHAR(2);

-- Índice para filtro por cidade em promoções
CREATE INDEX IF NOT EXISTS idx_promotions_city
    ON public.promotions (city);


-- =============================================================================
-- PARTE 3 — Tabela ADDRESSES: endereços de entrega por usuário
-- =============================================================================
-- Permite múltiplos endereços por usuário (Casa, Trabalho, etc.).
-- Relaciona-se com auth.users para integridade referencial automática.

CREATE TABLE IF NOT EXISTS public.addresses (
    id            UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Identificador amigável escolhido pelo usuário
    label         VARCHAR(50)  NOT NULL DEFAULT 'Casa',

    -- Dados brutos do endereço
    cep           VARCHAR(9),
    street        VARCHAR(200),
    number        VARCHAR(20),
    complement    VARCHAR(100),
    neighborhood  VARCHAR(100),
    city          VARCHAR(100) NOT NULL,
    state         VARCHAR(2)   NOT NULL,

    -- Coordenadas do endereço (geocodificado via Nominatim)
    latitude      DOUBLE PRECISION,
    longitude     DOUBLE PRECISION,

    -- Endereço padrão para entrega
    is_default    BOOLEAN      NOT NULL DEFAULT false,

    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Índice principal: buscar todos os endereços de um usuário
CREATE INDEX IF NOT EXISTS idx_addresses_user_id
    ON public.addresses (user_id);

-- Índice parcial: localiza rapidamente o endereço padrão do usuário
CREATE INDEX IF NOT EXISTS idx_addresses_default
    ON public.addresses (user_id, is_default)
    WHERE is_default = true;


-- =============================================================================
-- PARTE 4 — RLS (Row Level Security) para a tabela ADDRESSES
-- =============================================================================

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

-- Cada usuário vê apenas seus próprios endereços
CREATE POLICY "addresses: select próprio"
    ON public.addresses
    FOR SELECT
    USING (auth.uid() = user_id);

-- Cada usuário insere apenas com seu próprio user_id
CREATE POLICY "addresses: insert próprio"
    ON public.addresses
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Cada usuário atualiza apenas seus endereços
CREATE POLICY "addresses: update próprio"
    ON public.addresses
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Cada usuário deleta apenas seus endereços
CREATE POLICY "addresses: delete próprio"
    ON public.addresses
    FOR DELETE
    USING (auth.uid() = user_id);


-- =============================================================================
-- PARTE 5 — Trigger: updated_at automático na tabela ADDRESSES
-- =============================================================================

-- Função genérica de updated_at (reutilizável em outras tabelas)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Aplica o trigger na tabela addresses
DROP TRIGGER IF EXISTS trg_addresses_updated_at ON public.addresses;
CREATE TRIGGER trg_addresses_updated_at
    BEFORE UPDATE ON public.addresses
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- PARTE 6 — RPC helper (opcional): buscar promoções por cidade server-side
-- =============================================================================
-- Função auxiliar para filtrar promoções pela cidade do comerciante diretamente
-- no banco, sem transferir todos os registros para o cliente.
-- Útil no futuro quando o volume de promoções crescer.
--
-- Parâmetros:
--   p_city     TEXT  — nome da cidade (ex: 'Ivaí')
--   p_state    TEXT  — UF (ex: 'PR')
--   p_limit    INT   — máximo de promoções retornadas (padrão 30)

CREATE OR REPLACE FUNCTION public.get_promotions_by_city(
    p_city  TEXT,
    p_state TEXT DEFAULT NULL,
    p_limit INT  DEFAULT 30
)
RETURNS SETOF public.promotions
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT p.*
    FROM   public.promotions p
    JOIN   public.users u ON u.id = p.author_id
    WHERE  p.expires_at > NOW()
      AND  (
               -- Filtra pelo campo city da promoção (se já preenchido)
               p.city  ILIKE p_city
               -- OU pelo campo city do comerciante (join)
               OR u.city ILIKE p_city
           )
      AND  (
               p_state IS NULL
               OR p.state  ILIKE p_state
               OR u.state  ILIKE p_state
           )
    ORDER BY p.is_hot DESC, p.created_at DESC
    LIMIT p_limit;
$$;

-- Permissão para usuários autenticados e anônimos (feed público)
GRANT EXECUTE ON FUNCTION public.get_promotions_by_city(TEXT, TEXT, INT)
    TO authenticated, anon;


-- =============================================================================
-- VERIFICAÇÃO FINAL
-- =============================================================================
-- Execute a query abaixo separadamente para confirmar que as colunas foram criadas:
--
-- SELECT column_name, data_type
-- FROM   information_schema.columns
-- WHERE  table_schema = 'public'
--   AND  table_name   = 'users'
--   AND  column_name  IN ('cep', 'city', 'state', 'latitude', 'longitude')
-- ORDER BY column_name;
