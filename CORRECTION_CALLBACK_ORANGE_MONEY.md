# Correction du problème de callback Orange Money

**Date :** 5 avril 2026  
**Projet :** OFood Backend (NestJS)

---

## Problème identifié

Le backend ne recevait jamais la notification de succès ou d'échec après un paiement Orange Money.  
L'utilisateur payait, mais la commande restait bloquée en statut `AWAITING_PAYMENT`.

### Cause racine

Dans `src/payments/strategies/orange-money.strategy.ts` (lignes 69-70), les URLs de callback envoyées à l'API Orange Money pointaient directement vers le **frontend** :

```typescript
// AVANT (cassé)
const callbackSuccessUrl = `${this.frontendBaseUrl}/client/orders/${orderId}`;
const callbackCancelUrl = `${this.frontendBaseUrl}/client/orders/${orderId}`;
```

**Conséquence :** Quand Orange Money redirige l'utilisateur après paiement (via un GET sur ces URLs), la requête arrivait sur le frontend — le backend n'était jamais contacté et ne pouvait donc pas savoir si le paiement avait réussi ou échoué.

Le backend dépendait uniquement du webhook (`POST /payments/orange-money/callback`) qui n'est pas toujours fiable et peut ne jamais arriver.

---

## Corrections apportées

### 3 fichiers modifiés

| Fichier | Modification |
|---------|-------------|
| `src/payments/strategies/orange-money.strategy.ts` | URLs de callback redirigées vers le backend + méthode `getFrontendOrderUrl()` |
| `src/payments/payments.controller.ts` | 2 nouvelles routes GET publiques pour recevoir les redirections Orange Money |
| `src/payments/payments.service.ts` | Nouvelle méthode `handleOrangeMoneyRedirectCallback()` + amélioration du webhook |

---

### 1. Redirection des callback URLs vers le backend

**Fichier :** `src/payments/strategies/orange-money.strategy.ts`

```typescript
// APRÈS (corrigé)
const callbackSuccessUrl = `${this.appBaseUrl}/payments/orange-money/success/${orderId}`;
const callbackCancelUrl = `${this.appBaseUrl}/payments/orange-money/cancel/${orderId}`;
```

Ajout de la méthode `getFrontendOrderUrl()` pour que le controller puisse rediriger l'utilisateur vers le frontend après traitement.

---

### 2. Nouvelles routes GET publiques

**Fichier :** `src/payments/payments.controller.ts`

```
GET /payments/orange-money/success/:orderId   (public, pas de JWT)
GET /payments/orange-money/cancel/:orderId    (public, pas de JWT)
```

Ces routes :
- Reçoivent la redirection GET d'Orange Money
- Déclenchent le traitement dans le service
- Redirigent ensuite l'utilisateur vers le frontend (`/client/orders/:orderId`)

---

### 3. Nouvelle méthode `handleOrangeMoneyRedirectCallback()`

**Fichier :** `src/payments/payments.service.ts`

#### En cas de succès (`type === 'success'`) :
1. Recherche la transaction PENDING associée à la commande
2. Vérifie le statut réel via l'API Orange Money (`GET /api/eWallet/v4/qrcode/:qrId`)
3. Si confirmé → marque la transaction SUCCESS, passe la commande en PAID, crédite les restaurants
4. Si encore en cours → laisse le webhook finaliser
5. Si échec vérifié → marque FAILED, remet la commande en PENDING

#### En cas d'annulation (`type === 'cancel'`) :
1. Marque la transaction comme FAILED
2. Remet la commande en statut PENDING (permet un retry)

#### Protections :
- Idempotence : ignore si la commande est déjà PAID
- Ne fait pas confiance aveuglément à la redirection — vérifie toujours via l'API OM

---

### 4. Amélioration du webhook existant

**Méthode :** `handleOrangeMoneyCallback()`

- Gère plus de formats de payload Orange Money : `payload.notif.status`, `payload.paymentStatus`, `payload.notif.qrId`
- Reconnaît plus de statuts : `SUCCESSFULL`, `EXPIRED` (en plus de SUCCESS, ACCEPTED, FAILED, CANCELLED, REJECTED)
- Ajoute un check d'idempotence (commande déjà PAID → ignore)
- **Fallback actif** : si le statut du webhook est vide ou inconnu, vérifie le paiement via l'API OM au lieu d'ignorer silencieusement

---

## Flux avant / après

### AVANT (cassé)

```
Utilisateur paie via Orange Money
    → OM redirige vers le FRONTEND (GET /client/orders/:orderId)
    → Le backend n'est JAMAIS informé
    → La commande reste bloquée en AWAITING_PAYMENT
    → Seul le webhook (peu fiable) pouvait débloquer la situation
```

### APRÈS (corrigé)

```
Utilisateur paie via Orange Money
    → OM redirige vers le BACKEND (GET /payments/orange-money/success/:orderId)
    → Le backend vérifie le statut via l'API OM
    → Si succès : transaction SUCCESS + commande PAID + restaurants crédités
    → Si échec : transaction FAILED + commande PENDING (retry possible)
    → Le backend redirige l'utilisateur vers le frontend
    → Le webhook OM sert de backup (double sécurité)
```

---

## Points importants à vérifier

1. **`APP_URL`** dans le `.env` doit être l'URL publique du backend (accessible par les serveurs Orange Money, HTTPS obligatoire)
2. **Le webhook** doit aussi être enregistré via `POST /payments/orange-money/register-callback` (fait automatiquement au démarrage de l'app)
3. Les deux mécanismes (redirect + webhook) sont maintenant **complémentaires** — si l'un échoue, l'autre prend le relais
