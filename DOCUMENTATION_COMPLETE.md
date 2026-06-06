# 📚 Documentation Complète O'Food — Guide Technique Complet

## Vue d'ensemble du projet

**O'Food** est une plateforme de livraison de repas construite pour le marché sénégalais. Elle se compose de deux applications principales :

| Composant | Tech | Rôle |
|-----------|------|------|
| **ofood_backend** | NestJS 11 + TypeScript (83% TS) | API REST + WebSocket pour la gestion complète de la plateforme |
| **ofood_admin** | Next.js 16 + React 19 + TypeScript | Interface unifiée (Admin, Propriétaires restaurants, Clients) |

---

## 🏗️ Architecture générale

### Backend (NestJS)

```
src/
├── auth/              # Authentification (OTP, PIN, JWT)
├── users/             # Gestion profils utilisateurs
├── restaurants/       # CRUD restaurants, géolocalisation, portefeuille
├── dishes/            # Gestion plats et catégories
├── menus/             # Configuration menus hebdomadaires
├── orders/            # Cycle de vie commandes + WebSocket
├── payments/          # 🔑 CŒUR : Orange Money, Wave, Free Money
├── ratings/           # Évaluations restaurants post-livraison
├── notifications/     # SMS (Infobip/Termii)
├── admin/             # Dashboard, modération
├── delivery/          # Gestion des livraisons
├── wallet/            # Portefeuille utilisateur
├── common/            # Guards, décorateurs, pipes
├── prisma/            # Service ORM PostgreSQL
└── redis/             # Cache + sessions
```

### Frontend (Next.js)

```
src/
├── app/
│   ├── (auth)/        # Login, Register, OTP verification
│   └── (app)/
│       ├── admin/     # Dashboard admin
│       ├── owner/     # Espace propriétaire restaurant
│       └── client/    # Espace client final
├── components/        # Composants métier et UI
├── lib/
│   ├── api/           # Appels HTTP (Axios)
│   ├── stores/        # État global (Zustand)
│   ├── types/         # Types TypeScript
│   └── socket.ts      # Configuration WebSocket
```

---

## 💳 Intégration des paiements — Focus détaillé

### 1️⃣ Architecture des paiements

O'Food utilise un **pattern Strategy** pour supporter plusieurs fournisseurs :

```typescript
// Interface commune pour tous les fournisseurs
interface IPaymentStrategy {
  initiatePayment(amount, phone, provider, orderId): Promise<PaymentResult>
  verifyPayment(reference): Promise<PaymentResult>
}
```

**Fournisseurs implémentés :**
- **Orange Money** (async avec redirection) — `OrangeMoneyStrategy`
- **Wave** (mock) — `MockPaymentStrategy`
- **Free Money** (mock) — `MockPaymentStrategy`

---

### 2️⃣ Orange Money — Flux complet

#### 🔐 Configuration (`.env`)

```dotenv
ORANGE_MONEY_CLIENT_ID=a0367c8f-b4f3-4bf6-a92f-80085f69d405
ORANGE_MONEY_CLIENT_SECRET=4fe23143-fa7d-494f-92f5-6ecad28cd9bd
ORANGE_MONEY_MERCHANT_CODE=562070
ORANGE_MONEY_MERCHANT_NAME=OFood
ORANGE_MONEY_BASE_URL=https://api.sandbox.orange-sonatel.com
# ⚠️ CRITIQUE : Doit être l'URL publique du backend (HTTPS)
APP_URL=https://votre-backend.com
```

#### 📊 Flux de paiement (UX)

```
CLIENT                          BACKEND                       ORANGE MONEY
  │                               │                               │
  ├─ POST /payments/initiate ────>│                               │
  │  (orderId, phone, method)      │                               │
  │                                ├─ OAuth token ───────────────>│
  │                                │<─ access_token ──────────────┤
  │                                │                               │
  │                                ├─ POST /qrcode ──────────────>│
  │                                │  (callbackSuccessUrl, etc)    │
  │                                │<─ qrId, deepLink, qrCode ────┤
  │                                │                               │
  │<─ {qrCode, deepLinks} ─────────┤                               │
  │                                │                               │
  ├─ Scan QR + paie via OM ───────────────────────────────────────>│
  │                                                                 │
  │<─ Redirection GET ──────────────────────────────────────────────┤
  │  /payments/orange-money/success/:orderId                        │
  │                                                                 │
  │  ├─ Backend vérifie via GET /qrcode/:qrId                     │
  │  ├─ Met à jour transaction (SUCCESS)                          │
  │  ├─ Marque commande PAID                                      │
  │  ├─ Crédite restaurants                                       │
  │  └─ Redirige vers frontend (/client/orders/:orderId)          │
  │                                                                 │
  │<─ Page commande (PAID) ────────┤                              │
  │                                 │                              │
  │                    (Webhook OM comme backup) ──────────────────>│
  │                                 │<─ POST /payments/om/callback ┤
```

#### 🔄 Cycle de vie de la transaction

| Statut | Commande | Description |
|--------|----------|-------------|
| `PENDING` | `AWAITING_PAYMENT` | Paiement initié, en attente de confirmation |
| `SUCCESS` | `PAID` | Confirmé (redirect callback OU webhook) |
| `FAILED` | `PENDING` | Annulé ou expiré ; client peut réessayer |

#### 🎯 Fichiers clés

```typescript
// 1. Stratégie Orange Money
src/payments/strategies/orange-money.strategy.ts
├─ initiatePayment()          // Génère QR code
├─ verifyPayment()            // Vérifie statut via API OM
├─ registerCallback()         // Enregistre webhook auprès d'OM
└─ getFrontendOrderUrl()      // Construit URL de redirection frontend

// 2. Service de paiements
src/payments/payments.service.ts
├─ initiatePayment()          // Oriente vers strategy
├─ handleOrangeMoneyRedirectCallback()  // 🔑 Redirect GET
├─ handleOrangeMoneyCallback()          // Webhook POST
└─ confirmPaymentFromCallback()         // Finalise commande + wallets

// 3. Controller
src/payments/payments.controller.ts
├─ POST /payments/initiate
├─ POST /payments/:id/verify
├─ GET  /payments/orange-money/success/:orderId  (public)
├─ GET  /payments/orange-money/cancel/:orderId   (public)
└─ POST /payments/orange-money/callback          (webhook)
```

---

### 3️⃣ Double sécurité — Redirect + Webhook

**Problème historique :** Le backend ne recevait jamais la notification après paiement.

**Solution implémentée (avril 2026) :** Deux mécanismes complémentaires

```typescript
// Mécanisme 1 : Redirection GET (fiable — synchrone)
GET /payments/orange-money/success/:orderId
→ Backend vérifie immédiatement via API Orange Money
→ Si succès : transaction SUCCESS + commande PAID
→ Redirige frontend

// Mécanisme 2 : Webhook POST (fallback — asynchrone)
POST /payments/orange-money/callback
→ Reçu de OM en arrière-plan
→ Confirme si redirection a échoué
→ Redondance — idempotence garantie
```

**Idempotence :** Si la commande est déjà `PAID`, les deux mécanismes l'ignorent.

---

### 4️⃣ Modèle de données (Prisma)

```prisma
model Transaction {
  id              String            @id @default(uuid())
  orderId         String?
  restaurantId    String?
  type            TransactionType   // CREDIT | DEBIT
  amount          Float
  mobileProvider  PaymentMethod?    // ORANGE_MONEY | WAVE | FREE_MONEY | CASH_ON_DELIVERY
  phoneNumber     String?
  reference       String?           // qrId pour OM
  status          TransactionStatus // PENDING | SUCCESS | FAILED
  note            String?
  createdAt       DateTime
  order           Order?
  restaurant      Restaurant?
}

model Order {
  id              String            @id
  userId          String
  status          OrderStatus       // PENDING | AWAITING_PAYMENT | PAID | PREPARING | READY | DELIVERED
  totalAmount     Float
  paymentStatus   String            // "PAID" | "UNPAID"
  paymentMethod   PaymentMethod?
  paymentRef      String?           // référence paiement (qrId OM)
  items           OrderItem[]
  transactions    Transaction[]
}

model Restaurant {
  id              String
  walletBalance   Float             // Crédité au paiement client
}
```

---

### 5️⃣ Étapes pour ajouter un nouveau fournisseur

**Exemple : Intégrer Stripe**

```typescript
// 1. Créer la stratégie
// src/payments/strategies/stripe.strategy.ts
@Injectable()
export class StripeStrategy implements IPaymentStrategy {
  async initiatePayment(amount, phone, provider, orderId) {
    // Appeler Stripe API
    // Retourner { success, pending, reference, message, ... }
  }
  
  async verifyPayment(reference) {
    // Vérifier statut via Stripe
  }
}

// 2. Enregistrer dans PaymentsService
private readonly strategies = new Map<PaymentMethod, IPaymentStrategy>([
  [PaymentMethod.ORANGE_MONEY, orangeMoneyStrategy],
  [PaymentMethod.STRIPE, stripeStrategy],  // ← Nouveau
]);

// 3. Ajouter enum PaymentMethod dans Prisma
enum PaymentMethod {
  WAVE
  ORANGE_MONEY
  FREE_MONEY
  STRIPE  // ← Nouveau
}
```

---

## 🔐 Authentification

### Flux d'authentification

```
1. POST /auth/register
   → Envoie OTP par SMS (phone + PIN)

2. POST /auth/verify-otp
   → Valide OTP + crée utilisateur

3. POST /auth/login
   → Vérifie phone + PIN
   → Retourne JWT (access + refresh tokens)

4. Utilise JWT dans Authorization: Bearer <token>
```

### Rôles et permissions

```typescript
enum Role {
  CLIENT              // Peut commander, payer, noter
  RESTAURANT_OWNER    // Gère son restaurant, wallets
  ADMIN               // Modération, statistiques
  COURIER             // Livraisons (Phase 2)
}

// Dans les endpoints
@UseGuards(RolesGuard)
@Roles(Role.CLIENT)
async initiatePayment() { ... }
```

---

## 📱 Frontend (Next.js) — Intégration paiements

### Structure pour paiements

```typescript
// src/lib/api/payments.ts
export const paymentsApi = {
  initiatePayment: (orderId, method, phone) =>
    axios.post('/payments/initiate', { orderId, paymentMethod: method, phoneNumber: phone }),
  
  verifyPayment: (transactionId, reference) =>
    axios.post(`/payments/${transactionId}/verify`, { reference }),
  
  getOrderTransactions: (orderId) =>
    axios.get(`/payments/order/${orderId}`),
};

// src/lib/stores/paymentStore.ts (Zustand)
create((set) => ({
  transactions: [],
  loading: false,
  initiatePayment: async (orderId, method, phone) => {
    set({ loading: true });
    try {
      const res = await paymentsApi.initiatePayment(orderId, method, phone);
      set({ currentTransaction: res.data });
      // Afficher QR code ou deep link si Orange Money
      if (res.data.qrCode) showQRModal(res.data.qrCode);
    } finally {
      set({ loading: false });
    }
  },
}));
```

### Composant de paiement (exemple)

```typescript
// src/components/features/PaymentSelector.tsx
export function PaymentSelector({ orderId, totalAmount }) {
  const { initiatePayment } = usePaymentStore();
  const [phone, setPhone] = useState('');
  
  return (
    <div>
      <select onChange={(e) => setMethod(e.target.value)}>
        <option value="ORANGE_MONEY">Orange Money</option>
        <option value="WAVE">Wave</option>
      </select>
      
      <input
        placeholder="Numéro téléphone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      
      <button onClick={() => initiatePayment(orderId, method, phone)}>
        Payer {totalAmount} FCFA
      </button>
    </div>
  );
}
```

---

## 🚀 Setup et déploiement

### Backend (ofood_backend)

```bash
# 1. Installation
npm install

# 2. Configuration
cp .env.example .env
# Éditer : DATABASE_URL, REDIS_URL, ORANGE_MONEY_*, APP_URL

# 3. Migrations DB
npx prisma migrate dev
npx prisma generate

# 4. Démarrage
npm run start:dev          # Développement
npm run build && npm run start:prod  # Production
```

### Frontend (ofood_admin)

```bash
# 1. Installation
npm install

# 2. Configuration
# Éditer .env.local : NEXT_PUBLIC_API_URL (pointe vers backend)

# 3. Démarrage
npm run dev    # Développement
npm run build && npm run start  # Production
```

### Déploiement (Render)

- **Backend :** Web Service NestJS
- **BD :** PostgreSQL Render
- **Frontend :** Web Service Next.js (Vercel recommandé)
- **Variables critiques :**
  - `APP_URL` = URL publique backend (Orange Money la recontacte)
  - `DATABASE_URL` = Connection string PostgreSQL
  - `REDIS_URL` = Connection string Redis

---

## 📊 Flux de données — Commande complète

```
CLIENT (APP)                           BACKEND                              BD
   │
   ├─ Voir restaurants ────────────────> GET /restaurants (geo-filter)
   │                                    Retourne liste + ratings
   │
   ├─ Voir menus ──────────────────────> GET /restaurants/:id/menus/today
   │                                    Retourne plats du jour
   │
   ├─ Créer panier ────────────────────> POST /orders (items)
   │                                    ├─ Crée Order (PENDING)
   │                                    └─ Crée OrderItems
   │                                       ↓ BD
   │
   ├─ Payer ───────────────────────────> POST /payments/initiate
   │                                    ├─ Appelle OrangeMoneyStrategy
   │                                    ├─ Génère QR code
   │                                    ├─ Crée Transaction (PENDING)
   │                                    └─ Order → AWAITING_PAYMENT
   │                                       ↓ BD
   │
   ├─ Scanne QR + paie ──────────────────> Orange Money
   │                                       ├─ Traite paiement
   │                                       └─ Redirige vers backend
   │
   ├─ GET /payments/om/success ────────> Backend reçoit redirection
   │                                    ├─ Vérifie via API OM
   │                                    ├─ Transaction → SUCCESS
   │                                    ├─ Order → PAID
   │                                    ├─ Crédite Restaurant wallets
   │                                    └─ Redirige frontend
   │                                       ↓ BD
   │
   ├─ Voit commande PAID ──────────────> GET /orders/me
   │                                    Retourne commande + transactions
   │
   ├─ Restaurant accepte ──────────────> PATCH /orders/:id/status (PREPARING)
   │  (WebSocket notification) ◄────────┤ Envoie socket event
   │                                    ├─ Notifie client + courrier SMS
   │                                    └─ Notifie courtier via SMS
   │                                       ↓ BD
   │
   ├─ Livraison ──────────────────────> Socket.io real-time tracking
   │                                    ├─ Courtier envoie position
   │                                    ├─ Client voit courrier sur carte
   │                                    └─ Order → DELIVERED
   │
   └─ Note restaurant ─────────────────> POST /ratings
                                       ├─ Crée Rating
                                       ├─ Maj avg rating restaurant
                                       └─ Maj total ratings
                                          ↓ BD
```

---

## 🔍 Points clés à retenir

### Paiements Orange Money
1. **URL publique obligatoire** : `APP_URL` doit être accessible (HTTPS)
2. **Dual confirmation** : Redirect (priorité) + Webhook (fallback)
3. **Idempotence** : Peut retraiter sans dupliquer
4. **Vérification active** : Si webhook statut vide → vérifie via API

### Sécurité
- JWT access (15 min) + refresh (7j)
- PIN hasé bcrypt (stocké, jamais en clair)
- Rôles RBAC (guards)
- Transactions DB atomiques

### Performance
- Redis pour cache sessions/OTP
- WebSocket pour real-time (commandes, livraisons)
- Geo-filtering via PostGIS
- Pagination sur endpoints

---

## 📖 Pour prendre la main

**Priority d'apprentissage :**

1. **Semaine 1** : Comprendre authentification + structure NestJS
2. **Semaine 2** : Maîtriser Orange Money (initiate → redirect → webhook)
3. **Semaine 3** : Commandes (CRUD + statuts) + wallets
4. **Semaine 4** : Frontend (Zustand stores, Axios API calls)
5. **Semaine 5+** : Delivery, ratings, optimisations

**Tests locaux :**
```bash
# Simuler paiement Orange Money (mock)
POST http://localhost:3000/payments/initiate
{
  "orderId": "uuid",
  "paymentMethod": "ORANGE_MONEY",
  "phoneNumber": "+221700000000"
}

# Vérifier transaction
GET http://localhost:3000/payments/order/uuid-commande
```

---

Vous êtes maintenant capable de **comprendre l'architecture complète**, de **déployer les deux apps**, et surtout de **maîtriser l'intégration Orange Money** qui est le cœur critique du système. Bon développement ! 🚀
