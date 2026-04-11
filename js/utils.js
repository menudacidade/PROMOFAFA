/**
 * UTILITÁRIOS GLOBAIS - PROMOCITY
 * Funções auxiliares para formatação, validação e manipulação de dados
 */

// Formatação de moeda (Real brasileiro)
const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

// Formatação de data relativa (ex: "há 2 horas")
const formatRelativeTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'agora mesmo';
    if (diffInSeconds < 3600) return `há ${Math.floor(diffInSeconds / 60)} min`;
    if (diffInSeconds < 86400) return `há ${Math.floor(diffInSeconds / 3600)} h`;
    if (diffInSeconds < 604800) return `há ${Math.floor(diffInSeconds / 86400)} dias`;
    
    return date.toLocaleDateString('pt-BR');
};

// Formatação de data completa
const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

// Validação de email
const isValidEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
};

// Validação de telefone (WhatsApp)
const isValidPhone = (phone) => {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 13;
};

// Máscara de telefone
const maskPhone = (value) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length <= 10) {
        return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
};

// Sanitização de inputs
const sanitizeInput = (input) => {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
};

// Escape robusto para conteúdo textual em HTML
const escapeHTML = (value) => {
    const str = String(value ?? '');
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return str.replace(/[&<>"']/g, (char) => map[char]);
};

// Sanitização de URLs para atributos href/src
const sanitizeUrl = (url, options = {}) => {
    const {
        fallback = '',
        allowDataImage = false
    } = options;

    if (url == null) return fallback;

    const raw = String(url).trim();
    if (!raw) return fallback;

    const lower = raw.toLowerCase();
    if (lower.startsWith('javascript:')) return fallback;
    if (lower.startsWith('data:') && !allowDataImage) return fallback;
    if (lower.startsWith('data:') && allowDataImage) {
        return /^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);/i.test(raw) ? raw : fallback;
    }

    // Permite caminhos relativos de forma segura
    if (raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../')) {
        return raw;
    }

    try {
        const parsed = new URL(raw, window.location.origin);
        const safeProtocols = ['http:', 'https:', 'mailto:', 'tel:', 'blob:'];
        if (!safeProtocols.includes(parsed.protocol)) return fallback;
        return parsed.href;
    } catch (_) {
        return fallback;
    }
};

// Compressão de imagem antes do upload
const compressImage = (file, maxWidth = 1200, quality = 0.8) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            resolve(file);
                            return;
                        }
                        const safeName = (file.name && file.name.includes('.')) ? file.name : (file.name || 'image') + '.jpg';
                        resolve(new File([blob], safeName, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        }));
                    },
                    'image/jpeg',
                    quality
                );
            };
            
            img.onerror = (e) => {
                reject(e);
            };
        };
        
        reader.onerror = (e) => {
            reject(e);
        };
    });
};

// Geração de nome único para arquivos
const generateFileName = (prefix = 'file') => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}.jpg`;
};

// Debounce para eventos de input
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

// Throttle para scroll e resize
const throttle = (func, limit) => {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

// Verificação de conexão
const isOnline = () => navigator.onLine;

// Cache local seguro
const cache = {
    set: (key, value, ttl = 3600000) => {
        const item = {
            value,
            expiry: Date.now() + ttl
        };
        localStorage.setItem(`promocity_${key}`, JSON.stringify(item));
    },
    
    get: (key) => {
        const itemStr = localStorage.getItem(`promocity_${key}`);
        if (!itemStr) return null;

        try {
            const item = JSON.parse(itemStr);
            if (Date.now() > item.expiry) {
                localStorage.removeItem(`promocity_${key}`);
                return null;
            }
            return item.value;
        } catch (_) {
            // Valor corrompido — descarta
            localStorage.removeItem(`promocity_${key}`);
            return null;
        }
    },
    
    remove: (key) => {
        localStorage.removeItem(`promocity_${key}`);
    },
    
    clear: () => {
        Object.keys(localStorage)
            .filter(key => key.startsWith('promocity_'))
            .forEach(key => localStorage.removeItem(key));
    }
};

/**
 * FUNÇÃO MELHORADA: Geocodificação de endereço com prioridade para Ivaí-PR
 * @param {string} address - Endereço completo (ex: "Rua XV, 100, Ivaí - PR")
 * @returns {Promise<{lat: number, lon: number} | null>}
 */
async function geocodeAddress(address) {
    // Validação inicial
    if (!address || address.trim() === '') {
        console.warn('⚠️ [geocode] Endereço vazio');
        return null;
    }

    
    // Se o endereço não contiver "Ivaí" ou "PR", adiciona automaticamente
    let enderecoFormatado = address.trim();
    if (!enderecoFormatado.toLowerCase().includes('ivaí') && 
        !enderecoFormatado.toLowerCase().includes('pr')) {
        enderecoFormatado = `${enderecoFormatado}, Ivaí - PR`;
        console.log('ℹ️ [geocode] Cidade adicionada automaticamente:', enderecoFormatado);
    }
    
    // URL da API Nominatim com filtro de país (Brasil)
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(enderecoFormatado)}&limit=1&countrycodes=br`;
    
    try {
        // Adicionar um pequeno delay para respeitar limite de requisições
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'PROMOCITY-App (contato@promocity.com)'
            }
        });
        
        if (!response.ok) {
            console.warn('⚠️ [geocode] Erro na resposta do Nominatim:', response.status);
            return null;
        }
        
        const data = await response.json();
        
        if (data && data.length > 0) {
            const resultado = {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon)
            };
            console.log('✅ [geocode] Coordenadas encontradas:', resultado);
            return resultado;
        } else {
            console.warn('⚠️ [geocode] Nenhuma coordenada encontrada para:', enderecoFormatado);
            
            // ===== TENTATIVA FALLBACK: Busca mais ampla =====
            console.log('🔄 [geocode] Tentando busca mais ampla...');
            const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=5&countrycodes=br`;
            
            const fallbackResponse = await fetch(fallbackUrl, {
                headers: {
                    'User-Agent': 'PROMOCITY-App (contato@promocity.com)'
                }
            });
            
            if (fallbackResponse.ok) {
                const fallbackData = await fallbackResponse.json();
                if (fallbackData && fallbackData.length > 0) {
                    // Tenta encontrar o que tem Ivaí no nome
                    const ivaíResult = fallbackData.find(r => 
                        r.display_name.toLowerCase().includes('ivaí')
                    );
                    
                    if (ivaíResult) {
                        const resultado = {
                            lat: parseFloat(ivaíResult.lat),
                            lon: parseFloat(ivaíResult.lon)
                        };
                        console.log('✅ [geocode] Coordenadas encontradas no fallback:', resultado);
                        return resultado;
                    }
                    
                    // Se não achar Ivaí, pega o primeiro resultado
                    console.log('⚠️ [geocode] Nenhum resultado com Ivaí, usando o primeiro');
                    const resultado = {
                        lat: parseFloat(fallbackData[0].lat),
                        lon: parseFloat(fallbackData[0].lon)
                    };
                    return resultado;
                }
            }
            // ================================================
            
            return null;
        }
    } catch (error) {
        console.error('❌ [geocode] Erro na requisição:', error);
        return null;
    }
}

/**
 * FUNÇÃO MELHORADA: Normaliza número de telefone para formato WhatsApp internacional
 * Converte qualquer formato para: 55 + DDD + 9 + número (13 dígitos)
 * @param {string} phone - Número em qualquer formato
 * @returns {string|null} - Número formatado ou null se inválido
 */
function normalizeWhatsAppNumber(phone) {
    if (!phone || typeof phone !== 'string') return null;
    
    // Remove tudo que não é dígito
    let cleaned = phone.replace(/\D/g, '');
    
    // Se vazio após limpeza
    if (cleaned.length === 0) return null;
    
    // Se começa com 55 e tem 13 dígitos, já está no formato ideal
    if (cleaned.startsWith('55') && cleaned.length === 13) {
        return cleaned;
    }
    
    // Se tem 55 no início mas tamanho errado, remove para reprocessar
    if (cleaned.startsWith('55')) {
        cleaned = cleaned.substring(2);
    }
    
    // Agora processa o número sem o 55
    
    // 8 dígitos = número local antigo (sem 9, sem DDD)
    if (cleaned.length === 8) {
        // Assume DDD 42 (Ivaí-PR) e adiciona o 9
        cleaned = '429' + cleaned;
    }
    // 9 dígitos = número com 9 mas sem DDD
    else if (cleaned.length === 9) {
        // Assume DDD 42 (Ivaí-PR)
        cleaned = '42' + cleaned;
    }
    // 10 dígitos = DDD + número antigo (sem o 9)
    else if (cleaned.length === 10) {
        // Adiciona o 9 após o DDD
        const ddd = cleaned.substring(0, 2);
        const number = cleaned.substring(2);
        cleaned = ddd + '9' + number;
    }
    // 11 dígitos = DDD + 9 + número (formato correto brasileiro)
    else if (cleaned.length === 11) {
        // Já está correto, só adicionar o 55 depois
        // cleaned permanece igual
    }
    // Qualquer outro tamanho é inválido
    else {
        console.warn('⚠️ Número de telefone inválido:', phone, '- Tamanho:', cleaned.length);
        return null;
    }
    
    // Adiciona o 55 do Brasil
    const finalNumber = '55' + cleaned;
    
    // Validação final: deve ter exatamente 13 dígitos (55 + DDD + 9 + 8 dígitos)
    if (finalNumber.length !== 13) {
        console.warn('⚠️ Número final inválido:', finalNumber, '- Tamanho:', finalNumber.length);
        return null;
    }
    
    return finalNumber;
}

/**
 * Distância em km entre dois pontos (fórmula de Haversine)
 */
function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Calcula taxa de entrega (R$) por faixas de distância em km.
 * Tabela ajustada para cobrir entregas na cidade e no interior.
 *
 * Faixas:
 *   até  2 km → R$  6,00  (centro)
 *   até  5 km → R$ 10,00  (bairros)
 *   até 10 km → R$ 16,00  (limites do município)
 *   até 20 km → R$ 25,00  (interior próximo)
 *   até 35 km → R$ 38,00  (interior médio)
 *   acima 35 km → R$ 55,00 (interior distante)
 */
function calculateDeliveryFee(km) {
    const d = Math.max(0, km);
    if (d <= 2)  return 6.00;
    if (d <= 5)  return 10.00;
    if (d <= 10) return 16.00;
    if (d <= 20) return 25.00;
    if (d <= 35) return 38.00;
    return 55.00;
}

/**
 * Calcula o tempo restante em segundos até a promoção expirar.
 * @param {string} expiresAt - ISO timestamp de expiração
 * @returns {number} segundos restantes (mínimo 0)
 */
function getRemainingTime(expiresAt) {
    if (!expiresAt) return 0;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.floor(remaining / 1000));
}

/**
 * Formata segundos restantes para exibição digital no overlay HOT (cronômetro).
 * Formato: H:MM:SS s (minutos e segundos com 2 dígitos; horas sem zero à esquerda).
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatCountdown(totalSeconds) {
    if (totalSeconds <= 0) return '';
    const hours   = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const ss = String(seconds).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    return `${hours}:${mm}:${ss} s`;
}

// Exportação para uso global
window.utils = {
    formatCurrency,
    formatRelativeTime,
    formatDate,
    isValidEmail,
    isValidPhone,
    maskPhone,
    sanitizeInput,
    escapeHTML,
    sanitizeUrl,
    compressImage,
    generateFileName,
    debounce,
    throttle,
    isOnline,
    cache,
    geocodeAddress,
    normalizeWhatsAppNumber,
    getDistanceKm,
    calculateDeliveryFee,
    getRemainingTime,
    formatCountdown
};