# Fantasy Climbing League

A fantasy sports web application for IFSC World Cup climbing competitions. Create leagues, draft teams of climbers, and compete against friends based on real-world results.

## Features

- 🏆 **Create & Join Leagues** - Set up private leagues for boulder or lead climbing
- 👥 **Draft Your Team** - Select up to 6 climbers for your fantasy squad
- 👑 **Captain Bonus** - Your team captain earns bonus points (configurable, default 1.2x)
- 📊 **Real-time Leaderboards** - Track standings across all events
- 🔄 **Transfers** - Swap climbers between events
- 📈 **IFSC Scoring** - Authentic World Cup point system

## Tech Stack

### Backend

- **Python** with **FastAPI**
- **Supabase** (PostgreSQL + Auth)
- **Poetry** for dependency management
- **Pydantic** for data models

### Frontend

- **React** with TypeScript
- **Vite** for development
- **React Router** for navigation
- **Supabase Client** for auth

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- Poetry
- A Supabase project

### Setup

1. **Clone the repository**

2. **Set up the database**

   Run the `backend/schema.sql` in your Supabase SQL editor.

3. **Configure environment variables**

   Backend (`backend/.env`):

   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-service-role-key
   ```

   Frontend (`frontend/.env`):

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   VITE_API_URL=http://localhost:8000/api/v1
   ```

4. **Install dependencies**

   Backend:

   ```bash
   cd backend
   poetry install
   ```

   Frontend:

   ```bash
   cd frontend
   npm install
   ```

5. **Run the application**

   Backend:

   ```bash
   cd backend
   poetry run uvicorn app.main:app --reload
   ```

   Frontend:

   ```bash
   cd frontend
   npm run dev
   ```

6. **Seed mock data** (optional)

   Call the API endpoint:

   ```bash
   curl -X POST http://localhost:8000/api/v1/events/seed-mock-data
   ```

## Test Data System (Development)

We provide endpoints to simulate a full season using shifted dates.

1.  **Clear existing data**:

    ```bash
    curl -X DELETE "http://localhost:8000/api/v1/events/clear-test-data"
    ```

2.  **Initialize test season** (1 past event, others future):

    ```bash
    curl -X POST "http://localhost:8000/api/v1/events/setup-test-season?year=2025&num_past_events=1"
    ```

3.  **Simulate results** for an upcoming event:
    ```bash
    # Replace {event_id} with actual ID
    curl -X POST "http://localhost:8000/api/v1/events/{event_id}/add-results"
    ```

## API Documentation

Once the backend is running, visit:

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Scoring System

Points are awarded based on official IFSC World Cup rankings:

| Position | Points |
| -------- | ------ |
| 1st      | 1000   |
| 2nd      | 805    |
| 3rd      | 690    |
| 4th      | 610    |
| 5th      | 545    |
| 6th      | 495    |
| 7th      | 455    |
| 8th      | 415    |

Captain bonus: **Configurable per league** (default 1.2x = +20% bonus, range: 1.0x to 3.0x).

## Project Structure

```
fantasy-climbing-league/
├── backend/
│   ├── app/
│   │   ├── api/          # API routes
│   │   ├── core/         # Config
│   │   ├── db/           # Database client
│   │   ├── schemas/      # Pydantic models
│   │   └── services/     # Business logic
│   ├── schema.sql        # Database schema
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── context/      # Auth context
│   │   ├── pages/        # Page components
│   │   ├── services/     # API client
│   │   └── types/        # TypeScript types
│   └── package.json
└── README.md
```

## License

MIT
