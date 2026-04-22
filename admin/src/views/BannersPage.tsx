import { useEffect, useMemo, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { supabase } from '../lib/supabase'

type BannerRow = {
  id: string
  title: string
  image_url: string
  click_url: string
  is_active: boolean
  created_at: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function normalizeBannerRow(raw: unknown): BannerRow | null {
  const r = asRecord(raw)
  if (!r) return null
  const id = r.id
  if (typeof id !== 'string' || !id) return null

  return {
    id,
    title: typeof r.title === 'string' ? r.title : '',
    image_url: typeof r.image_url === 'string' ? r.image_url : '',
    click_url: typeof r.click_url === 'string' ? r.click_url : '',
    is_active: Boolean(r.is_active),
    created_at: typeof r.created_at === 'string' ? r.created_at : '',
  }
}

function formatDateTime(value: string) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  } catch {
    return value
  }
}

function isValidHttpUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return true
  try {
    const u = new URL(trimmed)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        aria-label="close modal overlay"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <div className="text-base font-semibold">{title}</div>
          <button
            className="rounded-md px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

type BannerDraft = {
  title: string
  click_url: string
  image_url: string
  image_file: File | null
}

function toDraft(row: BannerRow): BannerDraft {
  return {
    title: row.title ?? '',
    click_url: row.click_url ?? '',
    image_url: row.image_url ?? '',
    image_file: null,
  }
}

function fileExtFromType(type: string) {
  const t = type.toLowerCase()
  if (t === 'image/png') return 'png'
  if (t === 'image/webp') return 'webp'
  if (t === 'image/gif') return 'gif'
  if (t === 'image/jpeg' || t === 'image/jpg') return 'jpg'
  return null
}

function safeFileNameSegment(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return 'banner'
  return trimmed
    .toLowerCase()
    .replaceAll(/\s+/g, '-')
    .replaceAll(/[^a-z0-9-_]/g, '')
    .slice(0, 40)
}

function buildPublicUrlForStorage(bucket: string, path: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'))
    img.src = src
  })
}

async function cropImageToFile({
  imageSrc,
  cropPixels,
  fileName,
}: {
  imageSrc: string
  cropPixels: Area
  fileName: string
}) {
  const img = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(cropPixels.width))
  canvas.height = Math.max(1, Math.round(cropPixels.height))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('캔버스를 생성할 수 없습니다.')

  ctx.drawImage(
    img,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    cropPixels.width,
    cropPixels.height,
  )

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) reject(new Error('이미지 변환에 실패했습니다.'))
        else resolve(b)
      },
      'image/jpeg',
      0.92,
    )
  })

  return new File([blob], fileName, { type: 'image/jpeg' })
}

export function BannersPage() {
  const [rows, setRows] = useState<BannerRow[]>([])
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<BannerRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [cropPixels, setCropPixels] = useState<Area | null>(null)
  const [draft, setDraft] = useState<BannerDraft>({
    title: '',
    click_url: '',
    image_url: '',
    image_file: null,
  })

  // NOTE: 앱 홈 탭 배너는 슬라이드 형식이며, 등록된 배너 중 is_active = true인 것만 앱에 표시됩니다.

  const activeCount = useMemo(() => rows.filter((r) => r.is_active).length, [rows])

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('banners')
      .select('id,title,image_url,click_url,is_active,created_at')
      .order('created_at', { ascending: false })

    if (error) {
      alert(error.message)
      setRows([])
      setLoading(false)
      return
    }

    const mapped = (Array.isArray(data) ? data : [])
      .map((x) => normalizeBannerRow(x))
      .filter(Boolean) as BannerRow[]

    setRows(mapped)
    setLoading(false)
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!draft.image_file) {
      setPreviewObjectUrl(null)
      return
    }
    const url = URL.createObjectURL(draft.image_file)
    setPreviewObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [draft.image_file])

  useEffect(() => {
    if (!cropOpen || !cropSrc) return
    return () => {
      try {
        URL.revokeObjectURL(cropSrc)
      } catch {
        // ignore
      }
    }
  }, [cropOpen, cropSrc])

  const openCreate = () => {
    setEditing(null)
    setDraft({ title: '', click_url: '', image_url: '', image_file: null })
    setModalOpen(true)
  }

  const openEdit = (row: BannerRow) => {
    setEditing(row)
    setDraft(toDraft(row))
    setModalOpen(true)
  }

  const closeModal = () => {
    if (saving || uploading) return
    setModalOpen(false)
    setEditing(null)
  }

  const closeCrop = () => {
    setCropOpen(false)
    setCropSrc(null)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCropPixels(null)
  }

  const confirmCrop = async () => {
    if (!cropSrc || !cropPixels) {
      alert('크롭 영역을 선택해 주세요.')
      return
    }
    try {
      const fileName = `${safeFileNameSegment(draft.title || 'banner')}.jpg`
      const cropped = await cropImageToFile({
        imageSrc: cropSrc,
        cropPixels,
        fileName,
      })
      setDraft((prev) => ({
        ...prev,
        image_file: cropped,
        image_url: '',
      }))
      closeCrop()
    } catch (e: unknown) {
      const rec = asRecord(e)
      const msg = rec && typeof rec.message === 'string' ? String(rec.message) : null
      alert(msg ?? '이미지 크롭에 실패했습니다.')
    }
  }

  const uploadImageIfNeeded = async () => {
    if (!draft.image_file) return draft.image_url.trim()

    const file = draft.image_file
    const ext = fileExtFromType(file.type) ?? 'jpg'
    const now = new Date()
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate(),
    ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(
      now.getMinutes(),
    ).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    const base = safeFileNameSegment(draft.title || 'banner')
    const path = `banners/${stamp}-${base}.${ext}`

    setUploading(true)
    try {
      const { error } = await supabase.storage.from('banners').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      })
      if (error) throw error
      return buildPublicUrlForStorage('banners', path)
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    const title = draft.title.trim()
    const click_url = draft.click_url.trim()
    if (!title) {
      alert('배너 제목을 입력해 주세요.')
      return
    }
    if (!isValidHttpUrl(click_url)) {
      alert('클릭 URL은 http(s) URL 형식으로 입력해 주세요.')
      return
    }
    if (!draft.image_url.trim() && !draft.image_file) {
      alert('배너 이미지를 업로드해 주세요.')
      return
    }

    setSaving(true)
    try {
      const image_url = await uploadImageIfNeeded()
      if (!image_url) {
        alert('이미지 업로드에 실패했습니다.')
        return
      }

      if (editing) {
        const { data, error } = await supabase
          .from('banners')
          .update({ title, image_url, click_url })
          .eq('id', editing.id)
          .select('id,title,image_url,click_url,is_active,created_at')
          .maybeSingle()
        if (error) throw error

        const normalized = data ? normalizeBannerRow(data) : null
        if (normalized) {
          setRows((prev) => prev.map((x) => (x.id === editing.id ? normalized : x)))
        } else {
          setRows((prev) =>
            prev.map((x) => (x.id === editing.id ? { ...x, title, image_url, click_url } : x)),
          )
        }
      } else {
        const { data, error } = await supabase
          .from('banners')
          .insert({ title, image_url, click_url, is_active: true })
          .select('id,title,image_url,click_url,is_active,created_at')
          .maybeSingle()
        if (error) throw error

        const normalized = data ? normalizeBannerRow(data) : null
        if (normalized) {
          setRows((prev) => [normalized, ...prev])
        } else {
          await load()
        }
      }

      setModalOpen(false)
      setEditing(null)
    } catch (e: unknown) {
      const rec = asRecord(e)
      const msg = rec && typeof rec.message === 'string' ? String(rec.message) : null
      alert(msg ?? '저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (row: BannerRow) => {
    const next = !row.is_active
    setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, is_active: next } : x)))
    const { error } = await supabase.from('banners').update({ is_active: next }).eq('id', row.id)
    if (error) {
      alert(error.message)
      setRows((prev) =>
        prev.map((x) => (x.id === row.id ? { ...x, is_active: row.is_active } : x)),
      )
    }
  }

  const remove = async (row: BannerRow) => {
    const ok = confirm('해당 배너를 삭제하시겠습니까?')
    if (!ok) return

    const { error } = await supabase.from('banners').delete().eq('id', row.id)
    if (error) {
      alert(error.message)
      return
    }
    setRows((prev) => prev.filter((x) => x.id !== row.id))
  }

  const totalCount = rows.length

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="text-xl font-semibold text-neutral-900">배너 관리</div>
          <div className="text-sm font-medium text-neutral-700">
            전체 <span className="text-[#6C47FF]">{totalCount}</span>개 · 노출{' '}
            <span className="text-[#6C47FF]">{activeCount}</span>개
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            onClick={() => void load()}
          >
            새로고침
          </button>
          <button
            className="rounded-md bg-[#6C47FF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B3CF0]"
            onClick={openCreate}
          >
            + 배너 등록
          </button>
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="text-sm text-neutral-500">로딩 중...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-neutral-500">배너가 없습니다.</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3">등록일</th>
                    <th className="whitespace-nowrap px-4 py-3">배너 이미지</th>
                    <th className="whitespace-nowrap px-4 py-3">노출 상태</th>
                    <th className="whitespace-nowrap px-4 py-3">상세보기/수정</th>
                    <th className="whitespace-nowrap px-4 py-3">삭제</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-neutral-50">
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-800">
                        {formatDateTime(r.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        {r.image_url ? (
                          <div className="flex items-center gap-3">
                            <img
                              src={r.image_url}
                              alt={r.title || 'banner'}
                              className="h-[54px] w-[150px] rounded-md border border-neutral-200 object-cover"
                              loading="lazy"
                            />
                            <div className="min-w-0">
                              <div className="max-w-[360px] truncate text-sm font-medium text-neutral-900">
                                {r.title || '-'}
                              </div>
                              <div className="text-[11px] text-neutral-500">
                                권장 사이즈 670x240
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-neutral-500">이미지 없음</div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <button
                          className={[
                            'rounded-full border px-3 py-1 text-xs font-semibold',
                            r.is_active
                              ? 'border-[#6C47FF]/30 bg-[#6C47FF]/10 text-[#6C47FF]'
                              : 'border-neutral-200 bg-neutral-100 text-neutral-600',
                          ].join(' ')}
                          onClick={() => void toggleActive(r)}
                        >
                          {r.is_active ? 'ON' : 'OFF'}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <button
                          className="rounded-md border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                          onClick={() => openEdit(r)}
                        >
                          상세/수정
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <button
                          className="rounded-md bg-neutral-700 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800"
                          onClick={() => void remove(r)}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        title={editing ? '배너 수정' : '배너 등록'}
        onClose={closeModal}
      >
        <div className="grid grid-cols-1 gap-4">
          <label className="block">
            <div className="text-xs font-medium text-neutral-600">배너 제목(관리자 확인용)</div>
            <input
              value={draft.title}
              onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="예) 5월 이벤트 배너"
              className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none ring-[#6C47FF]/15 focus:ring-4"
              disabled={saving || uploading}
            />
            <div className="mt-1 text-[11px] text-neutral-500">
              앱에는 노출되지 않으며 관리자용으로만 사용됩니다.
            </div>
          </label>

          <label className="block">
            <div className="text-xs font-medium text-neutral-600">이미지 업로드</div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null
                if (!file) {
                  setDraft((prev) => ({ ...prev, image_file: null }))
                  return
                }
                const src = URL.createObjectURL(file)
                setCropSrc(src)
                setCropOpen(true)
                setCrop({ x: 0, y: 0 })
                setZoom(1)
                setCropPixels(null)
              }}
              className="mt-1 block w-full text-sm text-neutral-700 file:mr-3 file:rounded-md file:border file:border-neutral-200 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-700 hover:file:bg-neutral-50"
              disabled={saving || uploading}
            />
            <div className="mt-1 text-[11px] text-neutral-500">
              권장 사이즈 670x240 (Supabase Storage `banners` 버킷에 업로드됩니다.)
            </div>

            {(() => {
              const previewUrl = previewObjectUrl ?? draft.image_url ?? ''
              return previewUrl ? (
                <div className="mt-2 overflow-hidden rounded-lg border border-neutral-200">
                  <img
                    src={previewUrl}
                    alt="preview"
                    className="h-[160px] w-full object-cover"
                  />
                </div>
              ) : null
            })()}
          </label>

          <label className="block">
            <div className="text-xs font-medium text-neutral-600">클릭 URL</div>
            <input
              value={draft.click_url}
              onChange={(e) => setDraft((prev) => ({ ...prev, click_url: e.target.value }))}
              placeholder="https://..."
              className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none ring-[#6C47FF]/15 focus:ring-4"
              disabled={saving || uploading}
            />
            <div className="mt-1 text-[11px] text-neutral-500">
              비워두면 클릭 시 이동하지 않도록 앱에서 처리해 주세요.
            </div>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              onClick={closeModal}
              disabled={saving || uploading}
            >
              취소
            </button>
            <button
              className="rounded-md bg-[#6C47FF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B3CF0] disabled:opacity-50"
              onClick={() => void save()}
              disabled={saving || uploading}
            >
              저장하기
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={cropOpen} title="이미지 크롭" onClose={closeCrop}>
        <div className="grid grid-cols-1 gap-4">
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
            크롭 비율은 <span className="font-semibold text-[#6C47FF]">670:240</span>으로 고정됩니다.
          </div>

          <div className="relative h-[360px] w-full overflow-hidden rounded-xl bg-neutral-900">
            {cropSrc ? (
              <Cropper
                image={cropSrc}
                crop={crop}
                zoom={zoom}
                aspect={670 / 240}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, areaPixels) => setCropPixels(areaPixels)}
              />
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs font-medium text-neutral-600">확대</div>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              onClick={closeCrop}
            >
              취소
            </button>
            <button
              className="rounded-md bg-[#6C47FF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B3CF0]"
              onClick={() => void confirmCrop()}
            >
              확인
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
