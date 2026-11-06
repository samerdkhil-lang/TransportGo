# TransportGo 🚌

Application web complète de gestion et de réservation de transport interurbain (Client, Chauffeur, Administrateur).

---

## 📋 Sommaire
- [Architecture du projet](#-architecture-du-projet)
- [Installation & Démarrage](#-installation--démarrage)
- [Documentation de l'API REST](#-documentation-de-lapi-rest)
  - [Authentification (`/api/auth`)](#authentification-apiauth)
  - [Réservations (`/api/reservations`)](#réservations-apireservations)
  - [Trajets (`/api/trips`)](#trajets-apitrips)
  - [Véhicules (`/api/vehicles`)](#véhicules-apivehicles)
  - [Utilisateurs (`/api/users`)](#utilisateurs-apiusers)
  - [Santé du système (`/api/health`)](#santé-apihealth)
- [Rôles & Permissions](#-rôles--permissions)

---

## 🏗 Architecture du projet

```text
├── client/                 # Frontend React (Vite, React Router 7)
│   ├── src/
│   │   ├── pages/          # Trips, TripDetail, MyReservations, Validation, Manage, Admin, Login, Register
│   │   ├── auth/           # AuthContext (JWT session)
│   │   └── api.js          # Client Axios configuré avec intercepteur Bearer token
│   └── vercel.json         # Configuration déploiement Vercel
├── src/                    # Backend Node.js / Express
│   ├── routes/             # Endpoints API (auth, reservations, trips, vehicles, users)
│   ├── middleware/         # Authentification JWT & contrôle d'accès basé sur les rôles (RBAC)
│   ├── db.js               # Pool de connexions MySQL2 (support local/tunnel SSH & Cloud)
│   └── index.js            # Point d'entrée de l'API Express
├── schema.sql              # Schéma de base de données MySQL avec contraintes & déclencheurs
└── .env.example            # Modèle des variables d'environnement
```

---

## 🚀 Installation & Démarrage

### 1. Variables d'environnement
Créez un fichier `.env` à la racine :
```ini
PORT=5000
CORS_ORIGIN=http://localhost:5173

# Configuration MySQL (ex. via tunnel SSH ou hébergeur cloud)
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=app_user
DB_PASSWORD=VotreMotDePasse
DB_NAME=transport

JWT_SECRET=votre_cle_secrete_tres_longue
JWT_EXPIRES_IN=1d
```

### 2. Démarrage en local
```bash
# 1. Ouvrir le tunnel vers MySQL (si hébergé sur serveur distant Ubuntu)
ssh -N -L 3307:127.0.0.1:3306 user@ip-serveur

# 2. Installer les dépendances
npm install
npm install --prefix client

# 3. Lancer le backend
npm run dev

# 4. Lancer le frontend (Vite)
npm run client:dev
```

---

## 📖 Documentation de l'API REST

Toutes les requêtes protégées requièrent l'en-tête HTTP :
`Authorization: Bearer <token_jwt>`

### Authentification (`/api/auth`)

#### `POST /api/auth/register`
Créer un nouveau compte passager.
- **Corps (JSON) :**
  ```json
  {
    "name": "Jean Dupont",
    "email": "jean@example.com",
    "password": "Password123"
  }
  ```
- **Réponse (201 Created) :**
  ```json
  {
    "user": { "id": 10, "name": "Jean Dupont", "email": "jean@example.com", "role": "client" },
    "token": "eyJhbGciOiJIUzI1NiIsIn..."
  }
  ```

#### `POST /api/auth/login`
Connexion utilisateur.
- **Corps (JSON) :**
  ```json
  {
    "email": "jean@example.com",
    "password": "Password123"
  }
  ```
- **Réponses :**
  - `200 OK` : `{ "user": {...}, "token": "..." }`
  - `401 Unauthorized` : `{ "error": "Email ou mot de passe incorrect" }`

#### `GET /api/auth/me`
Obtenir le profil connecté.
- **Sécurité :** Authentifié
- **Réponse (200 OK) :** `{ "user": { "id": 1, "name": "...", "email": "...", "role": "client" } }`

---

### Réservations (`/api/reservations`)

#### `POST /api/reservations`
Créer et soumettre une réservation de place.
- **Sécurité :** Authentifié (`client`, `driver`, `admin`)
- **Corps (JSON) :**
  ```json
  {
    "trip_id": 1,
    "seat_number": 12
  }
  ```
- **Règles métier :** Le trajet doit être au statut `planned` et dans le futur. Le doublon de place est automatiquement verrouillé et refusé par la contrainte MySQL `seat_lock`.
- **Réponses :**
  - `201 Created` : Renvoie l'objet réservation avec son code unique (ex: `RES-8A3F19BC42`).
  - `409 Conflict` : `{ "error": "Cette place est déjà réservée" }`

#### `GET /api/reservations/mine`
Consulter l'historique de ses réservations avec QR Code.
- **Sécurité :** Authentifié
- **Réponse (200 OK) :**
  ```json
  {
    "reservations": [
      {
        "id": 1,
        "code": "RES-8A3F19BC42",
        "trip_id": 1,
        "seat_number": 12,
        "status": "confirmed",
        "origin": "Tunis",
        "destination": "Sousse",
        "departure_at": "2026-11-10T08:30:00.000Z",
        "price": "12.50"
      }
    ]
  }
  ```

#### `GET /api/reservations/:code`
Consulter une réservation spécifique par son code unique (billet ou scan QR Code).
- **Sécurité :** Passager concerné, chauffeur assigné au trajet, ou administrateur.
- **Réponses :**
  - `200 OK` : Détails de la réservation et du passager.
  - `403 Forbidden` : Accès non autorisé.
  - `404 Not Found` : Réservation introuvable.

#### `PATCH /api/reservations/:code/cancel`
Annuler une réservation confirmée.
- **Sécurité :** Passager propriétaire ou administrateur.
- **Règles métier :** Uniquement possible si le trajet n'est pas encore parti et si le billet n'a pas encore été validé.
- **Réponse (200 OK) :** Réservation mise à jour avec statut `cancelled`.

#### `POST /api/reservations/:code/validate`
Valider l'embarquement du passager lors de la montée dans le bus (scan chauffeur).
- **Sécurité :** Chauffeur du trajet ou Administrateur.
- **Réponses :**
  - `200 OK` : Statut passé à `validated`, enregistrement de la date `validated_at` et du validateur `validated_by`.
  - `409 Conflict` : `{ "error": "Billet déjà validé" }` ou `{ "error": "Réservation annulée" }`.

---

### Trajets (`/api/trips`)

- `GET /api/trips?origin=&destination=&date=` : Recherche publique de trajets à venir avec calcul des places disponibles.
- `GET /api/trips/:id` : Détails d'un trajet avec liste des places déjà occupées (`taken_seats`).
- `GET /api/trips/mine` : (Chauffeur/Admin) Liste des trajets assignés au chauffeur.
- `GET /api/trips/:id/reservations` : (Chauffeur/Admin) Liste des passagers réservés sur un trajet.
- `POST /api/trips` : (Chauffeur/Admin) Créer un nouveau trajet.
- `PATCH /api/trips/:id` : (Chauffeur/Admin) Modifier un trajet ou changer son statut (`planned`, `departed`, `completed`, `cancelled`).

---

### Véhicules (`/api/vehicles`)

- `GET /api/vehicles` : (Chauffeur/Admin) Liste du parc de véhicules.
- `POST /api/vehicles` : (Admin) Ajouter un véhicule (plaque, modèle, capacité).
- `PATCH /api/vehicles/:id` : (Admin) Mettre à jour le statut (`available`, `maintenance`, `retired`) ou la capacité.

---

### Utilisateurs (`/api/users`)

- `GET /api/users?role=` : (Admin) Lister les utilisateurs.
- `PATCH /api/users/:id/role` : (Admin) Modifier le rôle (`client`, `driver`, `admin`).

---

### Santé (`/api/health`)

- `GET /api/health` : Vérification de l'état du serveur et de la connexion MySQL.
  - `200 OK` : `{ "status": "ok", "database": "connected" }`
  - `503 Service Unavailable` : `{ "status": "degraded", "database": "disconnected" }`

---

## 👥 Rôles & Interactions système

| Rôle | Fonctionnalités clés |
|---|---|
| **Client** | Recherche de trajets, sélection de la place sur le plan du bus, soumission de la réservation, affichage du billet numérique avec QR Code, annulation avant départ. |
| **Chauffeur** | Consultation de ses trajets, visualisation de la liste des passagers par siège, contrôle et validation des billets/QR Codes à l'embarquement. |
| **Administrateur** | Gestion globale des trajets, assignation des chauffeurs et véhicules, gestion du parc de bus et attribution des rôles utilisateurs. |
