import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse } from '@/lib/security/api-guard';

export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req);
    if (errorResponse) return errorResponse;
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    return NextResponse.json({
      status: 'ONLINE',
      serverTime: new Date().toISOString(),
      organizationId: user.organizationId,
      userId: user.id,
      syncSupported: true,
      protocolVersion: '2.7.0',
    });
  } catch (err: any) {
    return safeErrorResponse(err);
  }
}
