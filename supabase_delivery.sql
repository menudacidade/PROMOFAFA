-- ============================================================
-- PROMOCITY - ENTREGAS E MOTOBOYS
-- Execute este script no SQL Editor do Supabase (Dashboard)
--
-- ⚠️ Se a tabela de perfil NÃO for public.users (ex.: usuarios_publicos),
--    faça Localizar/Substituir NESTE ARQUIVO:  public.users  →  public.NOME_DA_TABELA
--    (mesmo nome usado em PROMOCITY_PROFILE_TABLE no index.html)
-- ============================================================

-- 1) Novas colunas na tabela users (motoboy e localização em tempo real)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_motoboy boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS motoboy_vehicle text CHECK (motoboy_vehicle IN ('moto', 'bike', 'carro')),
ADD COLUMN IF NOT EXISTS motoboy_available boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS motoboy_lat double precision,
ADD COLUMN IF NOT EXISTS motoboy_lng double precision,
ADD COLUMN IF NOT EXISTS motoboy_updated_at timestamptz;

-- 2) Tabela de entregas
CREATE TABLE IF NOT EXISTS public.deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id bigint NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
    client_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    merchant_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    motoboy_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'pending_merchant' CHECK (status IN (
        'pending_merchant',   -- aguardando comerciante aceitar
        'accepted_merchant',  -- comerciante aceitou, aguardando motoboy
        'rejected_merchant',  -- comerciante recusou
        'waiting_motoboy',    -- mesmo que accepted_merchant (disponível para motoboy)
        'picked_up',         -- motoboy pegou no comerciante
        'in_delivery',       -- a caminho do cliente
        'delivered',         -- entregue
        'cancelled'
    )),
    pickup_address text NOT NULL,
    pickup_lat double precision,
    pickup_lng double precision,
    delivery_address text NOT NULL,
    delivery_lat double precision,
    delivery_lng double precision,
    delivery_fee decimal(10,2) NOT NULL DEFAULT 0,
    promo_total decimal(10,2) NOT NULL DEFAULT 0,
    total decimal(10,2) NOT NULL DEFAULT 0,
    client_phone text,
    client_name text,
    notes text,
    payment_method text CHECK (payment_method IN ('dinheiro', 'cartao', 'pix')),
    change_for decimal(10,2),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_deliveries_client ON public.deliveries(client_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_merchant ON public.deliveries(merchant_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_motoboy ON public.deliveries(motoboy_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON public.deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_created ON public.deliveries(created_at DESC);

-- 3) Tabela de localização do motoboy em tempo real (rastreio)
CREATE TABLE IF NOT EXISTS public.delivery_locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id uuid NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_locations_delivery ON public.delivery_locations(delivery_id);
CREATE INDEX IF NOT EXISTS idx_delivery_locations_created ON public.delivery_locations(delivery_id, created_at DESC);

-- 4) Tabela de avaliações da entrega
CREATE TABLE IF NOT EXISTS public.delivery_ratings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id uuid NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
    rater_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    rating smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment text,
    created_at timestamptz DEFAULT now(),
    UNIQUE(delivery_id, rater_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_ratings_delivery ON public.delivery_ratings(delivery_id);

-- 5) Trigger para updated_at em deliveries
CREATE OR REPLACE FUNCTION public.set_delivery_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_delivery_updated ON public.deliveries;
CREATE TRIGGER trigger_delivery_updated
    BEFORE UPDATE ON public.deliveries
    FOR EACH ROW EXECUTE FUNCTION public.set_delivery_updated_at();

-- 6) RLS (Row Level Security)
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ratings ENABLE ROW LEVEL SECURITY;

-- Políticas deliveries: cliente vê as suas; comerciante vê as do seu negócio; motoboy vê as que aceitou + disponíveis (via status)
DROP POLICY IF EXISTS "deliveries_select_own" ON public.deliveries;
CREATE POLICY "deliveries_select_own" ON public.deliveries FOR SELECT
    USING (
        auth.uid() = client_id OR auth.uid() = merchant_id OR auth.uid() = motoboy_id
        OR (status = 'accepted_merchant' AND motoboy_id IS NULL)  -- motoboys veem disponíveis
    );

DROP POLICY IF EXISTS "deliveries_insert_client" ON public.deliveries;
CREATE POLICY "deliveries_insert_client" ON public.deliveries FOR INSERT
    WITH CHECK (auth.uid() = client_id);

DROP POLICY IF EXISTS "deliveries_update_merchant_motoboy" ON public.deliveries;
CREATE POLICY "deliveries_update_merchant_motoboy" ON public.deliveries FOR UPDATE
    USING (
        auth.uid() = merchant_id OR auth.uid() = motoboy_id OR auth.uid() = client_id
        OR (status = 'accepted_merchant' AND motoboy_id IS NULL)  -- qualquer usuário autenticado pode aceitar (virar motoboy da entrega)
    );

-- Políticas delivery_locations: quem participa da entrega pode ler; só motoboy insere
DROP POLICY IF EXISTS "delivery_locations_select" ON public.delivery_locations;
CREATE POLICY "delivery_locations_select" ON public.delivery_locations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.deliveries d
            WHERE d.id = delivery_locations.delivery_id
            AND (d.client_id = auth.uid() OR d.merchant_id = auth.uid() OR d.motoboy_id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "delivery_locations_insert" ON public.delivery_locations;
CREATE POLICY "delivery_locations_insert" ON public.delivery_locations FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.deliveries d
            WHERE d.id = delivery_locations.delivery_id AND d.motoboy_id = auth.uid()
        )
    );

-- Políticas delivery_ratings: ler quem participou; inserir cliente/merchant após entregue
DROP POLICY IF EXISTS "delivery_ratings_select" ON public.delivery_ratings;
CREATE POLICY "delivery_ratings_select" ON public.delivery_ratings FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "delivery_ratings_insert" ON public.delivery_ratings;
CREATE POLICY "delivery_ratings_insert" ON public.delivery_ratings FOR INSERT
    WITH CHECK (auth.uid() = rater_id);

-- 7) Realtime: ative no Dashboard do Supabase em Database > Replication:
--    Marque as tabelas: "deliveries", "delivery_locations", "promotions", "stories", "notifications"
--    Sem isso o feed e notificações não atualizam automaticamente.

-- 8) MIGRAÇÃO: adicionar colunas de pagamento (execute se a tabela já existia antes desta versão)
ALTER TABLE public.deliveries
    ADD COLUMN IF NOT EXISTS payment_method text CHECK (payment_method IN ('dinheiro', 'cartao', 'pix')),
    ADD COLUMN IF NOT EXISTS change_for decimal(10,2);

-- Fim do script
