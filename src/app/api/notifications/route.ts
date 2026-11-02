import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { NotificationService } from '@/modules/notifications/notification.service';
import { SendNotificationDto } from '@/modules/notifications/types';
import {
  authenticateApiRequest,
  sanitizeString,
  isValidUuid,
  safeErrorResponse,
} from '@/lib/security/api-guard';

const DEFAULT_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

/**
 * GET /api/notifications
 * Récupère les notifications avec contrôle strict d'accès (un résident ne peut lire que ses notifications)
 */
export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const requestedUserId = searchParams.get('user_id');

    // Contrôle d'accès : un USER ne peut pas lire les notifications d'un autre utilisateur
    let targetUserId = user.id;
    if (requestedUserId && isValidUuid(requestedUserId) && requestedUserId !== user.id) {
      if (user.isPlatformAdmin || user.isTestOrDemo) {
        targetUserId = requestedUserId;
      } else if (user.role === 'ADMIN' && user.organizationId) {
        // Un admin d'entreprise ne peut consulter que les notifications des membres de SON organisation
        const { data: targetUser } = await supabaseAdmin
          .from('users')
          .select('organization_id')
          .eq('id', requestedUserId)
          .maybeSingle();
        if (targetUser?.organization_id !== user.organizationId) {
          return NextResponse.json({ error: 'Accès refusé à ces notifications' }, { status: 403 });
        }
        targetUserId = requestedUserId;
      }
    }

    const role = searchParams.get('role') || (user.role !== 'USER' ? user.role : undefined);
    const unreadOnly = searchParams.get('unread_only') === 'true';
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '30', 10), 1), 100);

    // Tenter l'appel RPC si disponible, sinon requête directe sur public.notifications
    let notifications: any[] = [];
    let unreadCount = 0;
    let rpcWorked = false;

    const userOrgId = user.organizationId || null;

    try {
      const { data, error } = await supabaseAdmin.rpc('get_securia_notifications', {
        p_user_id: targetUserId,
        p_role: role || null,
        p_limit: limit,
        p_unread_only: unreadOnly,
        p_organization_id: userOrgId,
      });

      if (!error && data) {
        notifications = data.notifications || [];
        unreadCount = data.unread_count || 0;
        rpcWorked = true;
      }
    } catch {
      rpcWorked = false;
    }

    if (!rpcWorked) {
      // Requête relationnelle directe sur public.notifications avec isolation multi-tenant
      let query = supabaseAdmin
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (userOrgId) {
        if (role) {
          query = query.eq('organization_id', userOrgId).or(`user_id.eq.${targetUserId},role.eq.${role}`);
        } else {
          query = query.eq('organization_id', userOrgId).eq('user_id', targetUserId);
        }
      } else {
        // Utilisateur sans organisation : uniquement ses notifications personnelles directes
        query = query.eq('user_id', targetUserId).is('organization_id', null);
      }

      if (unreadOnly) {
        query = query.eq('is_read', false);
      }

      const { data: dbNotifs, error: dbErr } = await query;
      if (!dbErr && dbNotifs) {
        notifications = dbNotifs;
      }

      // Nombre de non lus
      let unreadQuery = supabaseAdmin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false);

      if (userOrgId) {
        if (role) {
          unreadQuery = unreadQuery.eq('organization_id', userOrgId).or(`user_id.eq.${targetUserId},role.eq.${role}`);
        } else {
          unreadQuery = unreadQuery.eq('organization_id', userOrgId).eq('user_id', targetUserId);
        }
      } else {
        unreadQuery = unreadQuery.eq('user_id', targetUserId).is('organization_id', null);
      }

      const { count } = await unreadQuery;
      unreadCount = count || 0;
    }

    return NextResponse.json({
      success: true,
      unread_count: unreadCount,
      notifications: notifications,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la consultation des notifications');
  }
}

/**
 * POST /api/notifications
 * Émet une notification multi-canaux (IN_APP, PUSH, SMS secours, EMAIL administratif)
 */
export async function POST(req: NextRequest) {
  try {
    const body: SendNotificationDto = await req.json();

    if (!body.user_id || !body.title || !body.message || !body.type) {
      return NextResponse.json(
        { error: 'user_id, title, message et type sont obligatoires' },
        { status: 400 }
      );
    }

    const { user } = await authenticateApiRequest(req, {
      allowTestFallback: true,
    });

    const targetOrgId = (body.organization_id && isValidUuid(body.organization_id))
      ? body.organization_id
      : (user?.organizationId || undefined);

    // Assainissement des données textuelles
    const sanitizedDto: SendNotificationDto = {
      ...body,
      organization_id: targetOrgId,
      title: sanitizeString(body.title, 200),
      message: sanitizeString(body.message, 2000),
      link: body.link ? sanitizeString(body.link, 200) : undefined,
    };

    const result = await NotificationService.send(sanitizedDto);

    return NextResponse.json(
      {
        success: result.success,
        channelsDispatched: result.channelsDispatched,
        notification: result.inAppNotification,
        message: 'Notification acheminée avec succès',
      },
      { status: 201 }
    );
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de l’envoi de la notification');
  }
}

/**
 * PATCH /api/notifications
 * Marque une ou toutes les notifications comme lues
 */
export async function PATCH(req: NextRequest) {
  try {
    const { user } = await authenticateApiRequest(req, {
      allowTestFallback: true,
    });

    const body = await req.json();
    const { user_id, notification_id, mark_all_read = false } = body;

    const targetUserId = user?.isTestOrDemo && user_id ? user_id : (user?.id || user_id || DEFAULT_USER_ID);

    if (notification_id && !isValidUuid(notification_id)) {
      return NextResponse.json({ error: 'notification_id invalide (format UUID)' }, { status: 400 });
    }

    let updatedCount = 0;
    let rpcWorked = false;

    try {
      const { data, error } = await supabaseAdmin.rpc('mark_securia_notification_as_read', {
        p_user_id: targetUserId,
        p_notification_id: notification_id || null,
        p_mark_all: !!mark_all_read,
      });

      if (!error && data) {
        updatedCount = data?.updated_count || 0;
        rpcWorked = true;
      }
    } catch {
      rpcWorked = false;
    }

    if (!rpcWorked) {
      if (mark_all_read) {
        let updateQuery = supabaseAdmin
          .from('notifications')
          .update({ is_read: true })
          .eq('is_read', false);

        if (targetUserId) {
          updateQuery = updateQuery.eq('user_id', targetUserId);
        }
        const { data: updatedRows, error: updateErr } = await updateQuery.select('id');
        if (!updateErr && updatedRows) {
          updatedCount = updatedRows.length;
        }
      } else if (notification_id) {
        const { data: updatedRows, error: updateErr } = await supabaseAdmin
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notification_id)
          .select('id');
        if (!updateErr && updatedRows) {
          updatedCount = updatedRows.length;
        }
      }
    }

    return NextResponse.json({
      success: true,
      updated_count: updatedCount,
      message: mark_all_read ? 'Toutes les notifications ont été marquées comme lues' : 'Notification marquée comme lue',
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la mise à jour des notifications');
  }
}
