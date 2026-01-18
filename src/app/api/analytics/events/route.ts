// Analytics Events API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { trackEvent, trackEvents, getEvents, countEventsByType } from '@/lib/analytics';
import type { AnalyticsEvent, AnalyticsEventType } from '@/lib/analytics/types';

// GET /api/analytics/events - Get analytics events
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = searchParams.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId is required' },
        { status: 400 }
      );
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Parse filters
    const eventTypes = searchParams.get('eventTypes')?.split(',') as AnalyticsEventType[] | undefined;
    const campaignId = searchParams.get('campaignId') || undefined;
    const leadId = searchParams.get('leadId') || undefined;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    const dateRange = startDate && endDate
      ? { startDate: new Date(startDate), endDate: new Date(endDate) }
      : undefined;

    const events = await getEvents(workspaceId, {
      eventTypes,
      campaignId,
      leadId,
      dateRange,
      limit,
      offset,
    });

    return NextResponse.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}

// POST /api/analytics/events - Track events
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { events: eventList, event } = body as {
      events?: Omit<AnalyticsEvent, 'id' | 'timestamp'>[];
      event?: Omit<AnalyticsEvent, 'id' | 'timestamp'>;
    };

    // Handle single event
    if (event) {
      // Verify workspace access
      const { data: member } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', event.workspaceId)
        .eq('user_id', user.id)
        .single();

      if (!member) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      const eventId = await trackEvent({
        ...event,
        userId: user.id,
      });

      return NextResponse.json({ id: eventId }, { status: 201 });
    }

    // Handle batch events
    if (eventList && eventList.length > 0) {
      // Verify workspace access for all events
      const workspaceIds = [...new Set(eventList.map((e) => e.workspaceId))];

      for (const wsId of workspaceIds) {
        const { data: member } = await supabase
          .from('workspace_members')
          .select('role')
          .eq('workspace_id', wsId)
          .eq('user_id', user.id)
          .single();

        if (!member) {
          return NextResponse.json(
            { error: `Access denied for workspace ${wsId}` },
            { status: 403 }
          );
        }
      }

      const eventsWithUser = eventList.map((e) => ({
        ...e,
        userId: user.id,
      }));

      const eventIds = await trackEvents(eventsWithUser);

      return NextResponse.json({ ids: eventIds }, { status: 201 });
    }

    return NextResponse.json(
      { error: 'Either event or events array is required' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error tracking events:', error);
    return NextResponse.json(
      { error: 'Failed to track events' },
      { status: 500 }
    );
  }
}
