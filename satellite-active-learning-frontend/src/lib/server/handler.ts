import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { datasets, projects } from '@/db/schema';
import {
  ApiError,
  createProject,
  getDatasets,
  getMetrics,
  getProject,
  getProjects,
  getSamples,
  queryBatch,
  saveLabels,
  trainModel,
} from '@/lib/server/repository';
import { readMetadata } from '@/lib/geotiff';
type Context = { params: Promise<{ id?: string; action?: string; itemId?: string }> };
export async function handler(request: NextRequest, context: Context) {
  const { id, action, itemId } = (await context?.params) ?? {};
  const parts = [id, action, itemId].filter((v): v is string => !!v);
  const upstream = process.env.SATELLITE_API_URL;
  if (upstream) {
    try {
      const url = `${upstream.replace(/\/$/, '')}/projects${parts.length ? '/' + parts.map(encodeURIComponent).join('/') : ''}${request.nextUrl.search}`;
      const headers = new Headers();
      const type = request.headers.get('content-type');
      if (type) headers.set('content-type', type);
      if (process.env.SATELLITE_API_TOKEN)
        headers.set('authorization', `Bearer ${process.env.SATELLITE_API_TOKEN}`);
      const response = await fetch(url, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
        signal: AbortSignal.timeout(120000),
        cache: 'no-store',
      });
      return new NextResponse(response.body, {
        status: response.status,
        headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
      });
    } catch {
      return NextResponse.json(
        {
          error:
            'The satellite backend is unavailable. Check SATELLITE_API_URL and make sure the service is running.',
        },
        { status: 502 },
      );
    }
  }
  try {
    const method = request.method;
    if (!id && method === 'GET') return NextResponse.json(await getProjects());
    if (!id && method === 'POST')
      return NextResponse.json(await createProject(await request.json()), { status: 201 });
    if (id && !action && method === 'GET') return NextResponse.json(await getProject(id));
    if (id && action === 'dataset' && method === 'GET')
      return NextResponse.json(await getDatasets(id));
    if (id && action === 'predictions' && method === 'GET')
      return NextResponse.json(await getSamples(id));
    if (id && action === 'metrics' && method === 'GET')
      return NextResponse.json(await getMetrics(id));
    if (id && action === 'query' && method === 'POST') {
      const body = await request.json();
      return NextResponse.json(
        await queryBatch(id, body.batchSize ?? 12, body.strategy ?? 'entropy'),
      );
    }
    if (id && action === 'labels' && method === 'POST') {
      const body = await request.json();
      return NextResponse.json(await saveLabels(id, body.labels));
    }
    if (id && action === 'train' && method === 'POST')
      return NextResponse.json(await trainModel(id));
    if (id && action === 'upload' && method === 'POST') {
      const project = await getProject(id);
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File) || !/\.tiff?$/i.test(file.name))
        throw new ApiError('Choose a .tif or .tiff GeoTIFF file.');
      if (file.size > 100 * 1024 * 1024 || file.size === 0)
        throw new ApiError('GeoTIFFs must be non-empty and smaller than 100 MB.');
      const buffer = await file.arrayBuffer();
      let metadata;
      try {
        metadata = await readMetadata(buffer);
      } catch {
        throw new ApiError('This file is not a readable GeoTIFF. Check the file and try again.');
      }
      const uuid = randomUUID();
      const directory = path.join(process.cwd(), 'storage', 'uploads');
      await mkdir(directory, { recursive: true });
      const filename = `${uuid}.tif`;
      await writeFile(path.join(directory, filename), Buffer.from(buffer));
      let previewUrl: string | null = null;
      const preview = form.get('preview');
      if (
        preview instanceof File &&
        preview.type === 'image/png' &&
        preview.size < 10 * 1024 * 1024
      ) {
        await writeFile(
          path.join(directory, `${uuid}.png`),
          Buffer.from(await preview.arrayBuffer()),
        );
        previewUrl = `/api/files/${uuid}.png`;
      }
      const [dataset] = await db
        .insert(datasets)
        .values({
          id: uuid,
          projectId: id,
          name: file.name.slice(0, 200),
          size: file.size,
          ...metadata,
          url: `/api/files/${filename}`,
          previewUrl,
        })
        .returning();
      if (project.totalSamples === 0)
        await db.update(projects).set({ totalSamples: 2400 }).where(eq(projects.id, id));
      return NextResponse.json(dataset, { status: 201 });
    }
    if (id && action === 'dataset' && itemId && method === 'DELETE') {
      await getProject(id);
      const [dataset] = await db
        .delete(datasets)
        .where(and(eq(datasets.id, itemId), eq(datasets.projectId, id)))
        .returning();
      if (!dataset) throw new ApiError('Dataset not found.', 404);
      for (const url of [dataset.url, dataset.previewUrl])
        if (url?.startsWith('/api/files/'))
          await unlink(path.join(process.cwd(), 'storage', 'uploads', path.basename(url))).catch(
            () => undefined,
          );
      return NextResponse.json({ deleted: true });
    }
    throw new ApiError('Endpoint not found.', 404);
  } catch (error) {
    if (error instanceof ApiError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: 'The request body is not valid JSON.' }, { status: 400 });
    console.error('[TerraLab API]', error);
    return NextResponse.json(
      { error: 'We could not complete this request. Please try again.' },
      { status: 500 },
    );
  }
}
