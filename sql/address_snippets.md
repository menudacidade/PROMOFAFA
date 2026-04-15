# PROMOCITY — Snippets de Integração: Sistema de Cidade

> Cole cada bloco no arquivo indicado. Não modifique app.js, auth.js nem database.js além do indicado nas "Integrações Mínimas".

---

## 1. MODAL HTML — colar em `index.html`

**Onde colar:** logo antes da linha `<!-- SCRIPTS - UMA ÚNICA VEZ CADA -->` (perto do final do `<body>`).

```html
<!-- ===================================================================== -->
<!-- MODAL CONFIGURAÇÃO DE CIDADE (address.js)                              -->
<!-- ===================================================================== -->
<div id="city-setup-modal" class="modal-overlay hidden" aria-modal="true" role="dialog" aria-labelledby="city-modal-title">
    <div class="modal-content modal-city-setup">

        <!-- Cabeçalho -->
        <div class="modal-city-header">
            <div class="modal-city-icon-wrap">
                <i class="fas fa-map-marker-alt modal-city-icon"></i>
            </div>
            <button type="button" class="icon-btn modal-city-close" id="city-setup-close" aria-label="Fechar">
                <i class="fas fa-times"></i>
            </button>
        </div>

        <!-- Corpo -->
        <div class="modal-city-body">
            <h3 class="modal-city-title" id="city-modal-title">Qual é a sua cidade?</h3>
            <p class="modal-city-desc">
                Digite seu CEP para ver as promoções mais perto de você.
            </p>

            <form id="city-setup-form" class="auth-form" novalidate>
                <div class="input-group">
                    <i class="fas fa-location-dot"></i>
                    <input
                        type="text"
                        id="city-cep-input"
                        placeholder="00000-000"
                        inputmode="numeric"
                        maxlength="9"
                        autocomplete="postal-code"
                        required
                    >
                </div>

                <!-- Feedback de validação / cidade identificada -->
                <div id="city-setup-feedback" class="city-feedback" aria-live="polite" aria-atomic="true"></div>

                <button type="submit" class="btn btn-primary btn-block" id="city-setup-submit">
                    <i class="fas fa-map-marker-alt"></i> Confirmar cidade
                </button>
            </form>

            <button type="button" class="btn-city-skip" id="city-setup-skip">
                Pular por agora
            </button>
        </div>
    </div>
</div>
```

---

## 2. CHIP DE CIDADE NO FEED — colar em `index.html`

**Onde colar:** dentro de `<section id="main-screen">`, logo após a div `.stories-container` e antes de `<div class="home-cats-bar">`.  
Permite ao usuário ver/mudar a cidade ativa sem abrir o perfil.

```html
<!-- Filtro de cidade ativo (injetado por addressManager.updateCityDisplay) -->
<div class="city-filter-bar hidden" id="city-filter-bar">
    <button type="button" class="city-chip" id="city-change-btn" aria-label="Mudar cidade">
        <i class="fas fa-map-marker-alt"></i>
        <span id="city-display-label">📍 Definir cidade</span>
        <i class="fas fa-chevron-down city-chip-arrow"></i>
    </button>
</div>
```

---

## 3. CSS — colar no final de `css/style.css`

```css
/* ==========================================================================
   MODAL DE CONFIGURAÇÃO DE CIDADE (address.js)
   ========================================================================== */

.modal-city-setup {
    max-width: 380px;
    width: 92%;
    padding: 0;
    border-radius: 1.25rem;
    overflow: hidden;
}

.modal-city-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.25rem 0;
}

.modal-city-icon-wrap {
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    background: #eff6ff;
    display: flex;
    align-items: center;
    justify-content: center;
}

.modal-city-icon {
    font-size: 1.25rem;
    color: #1d4ed8;
}

.modal-city-close {
    margin-left: auto;
}

.modal-city-body {
    padding: 1rem 1.5rem 1.5rem;
}

.modal-city-title {
    font-size: 1.2rem;
    font-weight: 700;
    color: #111827;
    margin: 0.5rem 0 0.4rem;
}

.modal-city-desc {
    font-size: 0.9rem;
    color: #6b7280;
    margin-bottom: 1.25rem;
    line-height: 1.5;
}

/* Feedback de validação */
.city-feedback {
    font-size: 0.85rem;
    min-height: 1.4em;
    margin: 0.5rem 0 0.75rem;
    border-radius: 0.5rem;
    padding: 0 0.25rem;
    transition: color 0.2s;
}

.city-feedback--error {
    color: #dc2626;
}

.city-feedback--success {
    color: #16a34a;
}

.city-feedback--info {
    color: #2563eb;
}

.city-feedback--loading {
    color: #6b7280;
}

/* Botão "Pular por agora" */
.btn-city-skip {
    display: block;
    width: 100%;
    margin-top: 0.75rem;
    background: none;
    border: none;
    color: #6b7280;
    font-size: 0.85rem;
    text-align: center;
    cursor: pointer;
    padding: 0.4rem;
    border-radius: 0.5rem;
    transition: color 0.15s;
}

.btn-city-skip:hover {
    color: #374151;
}

/* ==========================================================================
   CHIP DE CIDADE NO FEED
   ========================================================================== */

.city-filter-bar {
    padding: 0 1rem 0.25rem;
}

.city-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: #eff6ff;
    border: 1.5px solid #bfdbfe;
    border-radius: 999px;
    padding: 0.35rem 0.85rem;
    font-size: 0.82rem;
    font-weight: 600;
    color: #1d4ed8;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
}

.city-chip:hover {
    background: #dbeafe;
    border-color: #93c5fd;
}

.city-chip-arrow {
    font-size: 0.65rem;
    opacity: 0.7;
    flex-shrink: 0;
}

#city-display-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
```

---

## 4. SCRIPT TAG — colar em `index.html`

**Onde colar:** na lista de `<script>` no final do `<body>`, **depois de `supabase.js`** e **antes de `app.js`**.

```html
<script src="js/address.js?v=20260414"></script>
```

**Ordem correta final:**
```html
<script src="js/utils.js?v=20260408"></script>
<script>window.PROMOCITY_PROFILE_TABLE = 'users';</script>
<script>window.PROMOCITY_HIGHLIGHTS_TABLE = 'merchant_highlights';</script>
<script src="js/supabase.js?v=20260408"></script>
<script src="js/database.js?v=20260411"></script>
<script src="js/auth.js?v=20260407a"></script>
<script src="js/address.js?v=20260414"></script>  ← NOVO (depois de auth.js)
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="js/map.js?v=20260408"></script>
<script src="js/ui.js?v=20260407a"></script>
<script src="js/app.js?v=20260411"></script>
```

---

## 5. INTEGRAÇÕES MÍNIMAS EM `app.js` (edições pontuais)

São apenas **3 adições** ao `app.js`. Localize cada trecho e adicione a linha indicada.

---

### 5.1 — Inicializar o módulo (no `init()`)

**Localize** (app.js ~linha 48):
```javascript
this.setupEventListeners();
this.setupAuthListener();
```

**Adicione logo ANTES:**
```javascript
addressManager.init();          // registra listeners do modal de cidade
```

---

### 5.2 — Perguntar cidade após login (no `setupAuthListener`)

**Localize** (app.js ~linha 1127):
```javascript
this.updateHeaderAvatar();

const addMenuBtn = document.getElementById('btn-add-menu');
```

**Adicione logo APÓS `this.updateHeaderAvatar();`:**
```javascript
addressManager.checkAndPromptCity();  // mostra modal se cidade não configurada
addressManager.updateCityDisplay();   // atualiza chip no feed
```

---

### 5.3 — Aplicar filtro de cidade no feed (em `loadInitialData`)

**Localize** (app.js ~linha 238, dentro de `loadInitialData`):
```javascript
const promotions = promotionsResult.value;
```

**Substitua por:**
```javascript
const promotions = addressManager.applyFeedFilter(promotionsResult.value);
```

> **Nota:** o filtro é não-destrutivo. Se o usuário não tiver cidade configurada, `applyFeedFilter` retorna a lista original completa.

---

### 5.4 — Recarregar feed quando cidade muda (em `setupEventListeners` ou depois)

**Localize** (app.js ~linha 483, final de `setupEventListeners`):
```javascript
this._syncRegisterCooldownUi();
```

**Adicione logo DEPOIS:**
```javascript
// Recarrega o feed automaticamente quando o usuário confirma a cidade
document.addEventListener('promocity:cityChanged', () => {
    this.loadInitialData();
    addressManager.updateCityDisplay();
});
```

---

## 6. INTEGRAÇÃO OPCIONAL: "Mudar cidade" no perfil

No `index.html`, dentro da tela `#edit-profile-screen`, após o campo de telefone:

```html
<div class="form-group">
    <label>Minha cidade</label>
    <button type="button" class="btn btn-secondary" id="city-change-btn" style="width:100%">
        <i class="fas fa-map-marker-alt"></i>
        <span id="city-display-label">Definir cidade</span>
    </button>
</div>
```

O `id="city-change-btn"` já é capturado automaticamente pelo `addressManager.init()`.

---

## 7. LIMPEZA NO LOGOUT

No `auth.logout()` (auth.js), após `this.session = null;`, adicione:

```javascript
if (typeof addressManager !== 'undefined') {
    addressManager.clearCityPreference();
}
```

> Isso garante que a cidade do usuário anterior não fique salva quando outro usuário fizer login no mesmo dispositivo.

---

## 8. ORDEM DE EXECUÇÃO DO MIGRATION SQL

1. Abra o **Supabase Dashboard** → **SQL Editor** → **New Query**
2. Cole o conteúdo de `sql/address_migration.sql`
3. Clique em **Run**
4. Execute a query de verificação no final do arquivo para confirmar as colunas

---

## Resumo dos arquivos criados/modificados

| Arquivo | Ação |
|---|---|
| `js/address.js` | **NOVO** — módulo completo |
| `sql/address_migration.sql` | **NOVO** — migration do banco |
| `index.html` | **EDITAR** — 3 blocos: modal, chip, script tag |
| `css/style.css` | **EDITAR** — adicionar CSS ao final |
| `js/app.js` | **EDITAR** — 4 adições pontuais (linhas indicadas) |
| `js/auth.js` | **EDITAR** — 1 adição no logout (opcional mas recomendado) |
