/**
 * POST /api/video/gateways/pair - Appairage sécurisé de la passerelle locale (Edge Gateway)
 * Échange un code temporaire unique (valide 20 min) contre un jeton permanent d'authentification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { safeErrorResponse, checkRateLimit, sanitizeString } from '@/lib/security/api-guard';
import { VideoRepository } from '@/lib/video';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    // Protection anti force-brute stricte : max 5 tentatives par minute par IP
    const rate = await checkRateLimit(`video_gw_pairing_${ip}`, 5, 60000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Trop de tentatives d’appairage. Veuillez patienter avant de réessayer.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const pairingCode = sanitizeString(body.pairing_code);
    const hardwareId = sanitizeString(body.hardware_id);
    const version = sanitizeString(body.version) || '0.1.0';
    const ipAddressLocal = body.ip_address_local ? sanitizeString(body.ip_address_local) : undefined;

    if (!pairingCode || pairingCode.length < 6) {
      return NextResponse.json({ error: 'Code d’appairage requis (format SEC-GW-XXXXXX).' }, { status: 400 });
    }

    if (!hardwareId) {
      return NextResponse.json({ error: 'Identifiant matériel (hardware_id) requis pour lier la machine.' }, { status: 400 });
    }

    const pairingResponse = await VideoRepository.pairGateway({
      pairing_code: pairingCode,
      hardware_id: hardwareId,
      version,
      ip_address_local: ipAddressLocal,
    });

    return NextResponse.json({
      success: true,
      message: 'Appairage réussi. La passerelle est maintenant en ligne et liée au site protégé.',
      ...pairingResponse,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Échec de l’appairage' }, { status: 400 });
  }
}
