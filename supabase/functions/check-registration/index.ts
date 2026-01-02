// Supabase Edge Function: check-registration
// Checks if athletes are registered for an IFSC event

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const IFSC_BASE_URL = "https://ifsc.results.info";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { event_id, climber_ids } = await req.json();

    if (!event_id || !climber_ids || !Array.isArray(climber_ids)) {
      return new Response(
        JSON.stringify({ error: "event_id and climber_ids array required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // IFSC uses truncated event IDs for registrations
    const truncatedEventId = Math.floor(event_id / 10);

    // Get session cookie from IFSC
    const sessionResponse = await fetch(IFSC_BASE_URL + "/", {
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const cookies = sessionResponse.headers.get("set-cookie") || "";
    const sessionMatch = cookies.match(
      /_verticallife_resultservice_session=([^;]+)/
    );
    const sessionCookie = sessionMatch ? sessionMatch[1] : "";

    // Fetch registrations from IFSC API
    const registrationsResponse = await fetch(
      `${IFSC_BASE_URL}/api/v1/events/${truncatedEventId}/registrations`,
      {
        headers: {
          accept: "application/json",
          "user-agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
          referer: IFSC_BASE_URL + "/",
          cookie: `_verticallife_resultservice_session=${sessionCookie}`,
        },
      }
    );

    if (!registrationsResponse.ok) {
      throw new Error(`IFSC API error: ${registrationsResponse.status}`);
    }

    const registrations = await registrationsResponse.json();

    // Build set of registered athlete IDs
    const registeredIds = new Set(
      registrations.map((r: { athlete_id: number }) => r.athlete_id)
    );

    // Build result mapping
    const result: Record<number, boolean> = {};
    for (const id of climber_ids) {
      result[id] = registeredIds.has(id);
    }

    return new Response(
      JSON.stringify({
        event_id,
        registrations: result,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error checking registration:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
