import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type ProductCategory = 'matching_ticket' | 'pt_ticket'

type ProductRow = {
  id: string
  category: ProductCategory
  title: string
  ticket_count: number
  price: number
  original_price: number
  discount_rate: number
  bonus_points: number
  is_active: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function asCategory(value: unknown): ProductCategory {
  return value === 'pt_ticket' || value === 'matching_ticket'
    ? value
    : 'matching_ticket'
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function normalizeProductRow(raw: unknown): ProductRow | null {
  const r = asRecord(raw)
  if (!r) return null
  const id = r.id
  if (typeof id !== 'string' || !id) return null

  return {
    id,
    category: asCategory(r.category),
    title: typeof r.title === 'string' ? r.title : '',
    ticket_count: asNumber(r.ticket_count),
    price: asNumber(r.price),
    original_price: asNumber(r.original_price),
    discount_rate: asNumber(r.discount_rate),
    bonus_points: asNumber(r.bonus_points),
    is_active: Boolean(r.is_active),
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

function formatKRW(value: number) {
  const safe = Number.isFinite(value) ? value : 0
  try {
    return `₩${new Intl.NumberFormat('ko-KR').format(Math.round(safe))}`
  } catch {
    return `₩${Math.round(safe)}`
  }
}

function parseNumber(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return 0
  const n = Number(trimmed.replaceAll(',', ''))
  return Number.isFinite(n) ? n : 0
}

function categoryLabel(category: ProductCategory) {
  return category === 'pt_ticket' ? '피티권' : '매칭권'
}

type ProductDraft = {
  category: ProductCategory
  title: string
  ticket_count: string
  original_price: string
  price: string
  discount_rate: string
  bonus_points: string
}

function toDraft(row: ProductRow): ProductDraft {
  return {
    category: row.category,
    title: row.title ?? '',
    ticket_count: String(row.ticket_count ?? 0),
    original_price: String(row.original_price ?? 0),
    price: String(row.price ?? 0),
    discount_rate: String(row.discount_rate ?? 0),
    bonus_points: String(row.bonus_points ?? 0),
  }
}

function computeDiscountedPrice(originalPrice: number, discountRate: number) {
  const safeOriginal = Number.isFinite(originalPrice) ? originalPrice : 0
  const safeRate = Number.isFinite(discountRate) ? discountRate : 0
  const clampedRate = Math.min(100, Math.max(0, safeRate))
  const discounted = safeOriginal * (1 - clampedRate / 100)
  return Math.round(discounted)
}

function draftToPayload(draft: ProductDraft) {
  const original_price = parseNumber(draft.original_price)
  const discount_rate = parseNumber(draft.discount_rate)
  const price =
    original_price > 0
      ? computeDiscountedPrice(original_price, discount_rate)
      : parseNumber(draft.price)

  return {
    category: draft.category,
    title: draft.title.trim(),
    ticket_count: parseNumber(draft.ticket_count),
    original_price,
    price,
    discount_rate,
    bonus_points: parseNumber(draft.bonus_points),
  }
}

export function ProductsPage() {
  const [rows, setRows] = useState<ProductRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<ProductCategory>('matching_ticket')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ProductRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<ProductDraft>({
    category: 'matching_ticket',
    title: '',
    ticket_count: '0',
    original_price: '0',
    price: '0',
    discount_rate: '0',
    bonus_points: '0',
  })

  const visibleRows = useMemo(
    () => rows.filter((r) => r.category === tab),
    [rows, tab],
  )

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select(
        'id,category,title,ticket_count,original_price,price,discount_rate,bonus_points,is_active',
      )
      .order('price', { ascending: true })

    if (error) {
      alert(error.message)
      setRows([])
      setLoading(false)
      return
    }

    const mapped = (Array.isArray(data) ? data : [])
      .map((x) => normalizeProductRow(x))
      .filter(Boolean) as ProductRow[]

    setRows(mapped)
    setLoading(false)
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(t)
  }, [])

  const openCreate = () => {
    setEditing(null)
    setDraft({
      category: tab,
      title: '',
      ticket_count: '0',
      original_price: '0',
      price: '0',
      discount_rate: '0',
      bonus_points: '0',
    })
    setModalOpen(true)
  }

  const openEdit = (row: ProductRow) => {
    setEditing(row)
    setDraft(toDraft(row))
    setModalOpen(true)
  }

  const closeModal = () => {
    if (saving) return
    setModalOpen(false)
    setEditing(null)
  }

  const save = async () => {
    const payload = draftToPayload(draft)
    if (!payload.title) {
      alert('상품명을 입력해 주세요.')
      return
    }
    if (payload.price < 0 || payload.ticket_count < 0) {
      alert('가격/매칭권 수는 0 이상으로 입력해 주세요.')
      return
    }
    if (payload.discount_rate < 0 || payload.discount_rate > 100) {
      alert('할인율은 0~100 사이로 입력해 주세요.')
      return
    }
    if (payload.bonus_points < 0) {
      alert('추가 포인트는 0 이상으로 입력해 주세요.')
      return
    }

    setSaving(true)
    try {
      if (editing) {
        const { data, error } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editing.id)
          .select(
            'id,category,title,ticket_count,original_price,price,discount_rate,bonus_points,is_active',
          )
          .maybeSingle()
        if (error) throw error

        const normalized = data ? normalizeProductRow(data) : null
        if (normalized) {
          setRows((prev) => prev.map((x) => (x.id === editing.id ? normalized : x)))
        } else {
          setRows((prev) =>
            prev.map((x) => (x.id === editing.id ? { ...x, ...payload } : x)),
          )
        }
      } else {
        const { data, error } = await supabase
          .from('products')
          .insert({ ...payload, is_active: true })
          .select(
            'id,category,title,ticket_count,original_price,price,discount_rate,bonus_points,is_active',
          )
          .maybeSingle()
        if (error) throw error

        const normalized = data ? normalizeProductRow(data) : null
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
      const msg =
        rec && typeof rec.message === 'string' ? String(rec.message) : null
      alert(msg ?? '저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (row: ProductRow) => {
    const next = !row.is_active
    setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, is_active: next } : x)))

    const { error } = await supabase
      .from('products')
      .update({ is_active: next })
      .eq('id', row.id)
    if (error) {
      alert(error.message)
      setRows((prev) =>
        prev.map((x) => (x.id === row.id ? { ...x, is_active: row.is_active } : x)),
      )
    }
  }

  const remove = async (row: ProductRow) => {
    const ok = confirm('해당 상품을 삭제하시겠습니까?')
    if (!ok) return

    const { error } = await supabase.from('products').delete().eq('id', row.id)
    if (error) {
      alert(error.message)
      return
    }
    setRows((prev) => prev.filter((x) => x.id !== row.id))
  }

  const totalCount = visibleRows.length

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="text-xl font-semibold text-neutral-900">상품 관리</div>
          <div className="text-sm font-medium text-neutral-700">
            {categoryLabel(tab)}{' '}
            <span className="text-[#6C47FF]">{totalCount}</span>개
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
            + 상품 등록
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-full bg-neutral-100 p-1">
        <div className="grid grid-cols-2 gap-1">
          <button
            className={[
              'rounded-full px-3 py-2 text-sm font-medium',
              tab === 'matching_ticket'
                ? 'bg-[#6C47FF] text-white'
                : 'text-neutral-600 hover:bg-white',
            ].join(' ')}
            onClick={() => setTab('matching_ticket')}
          >
            매칭권
          </button>
          <button
            className={[
              'rounded-full px-3 py-2 text-sm font-medium',
              tab === 'pt_ticket'
                ? 'bg-[#6C47FF] text-white'
                : 'text-neutral-600 hover:bg-white',
            ].join(' ')}
            onClick={() => setTab('pt_ticket')}
          >
            피티권
          </button>
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="text-sm text-neutral-500">로딩 중...</div>
        ) : visibleRows.length === 0 ? (
          <div className="text-sm text-neutral-500">상품이 없습니다.</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3">상품명</th>
                    <th className="whitespace-nowrap px-4 py-3">매칭권 수</th>
                    <th className="whitespace-nowrap px-4 py-3">가격</th>
                    <th className="whitespace-nowrap px-4 py-3">할인율</th>
                    <th className="whitespace-nowrap px-4 py-3">추가 포인트</th>
                    <th className="whitespace-nowrap px-4 py-3">노출 상태</th>
                    <th className="whitespace-nowrap px-4 py-3">수정</th>
                    <th className="whitespace-nowrap px-4 py-3">삭제</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {visibleRows.map((r) => (
                    <tr key={r.id} className="hover:bg-neutral-50">
                      <td className="max-w-[360px] truncate px-4 py-3 font-medium text-neutral-900">
                        {r.title || '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-800">
                        {r.ticket_count}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-900">
                        {formatKRW(r.price)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-800">
                        {r.discount_rate}%
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-800">
                        {r.bonus_points}
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
                          수정
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
        title={editing ? '상품 수정' : '상품 등록'}
        onClose={closeModal}
      >
        {(() => {
          const originalPrice = parseNumber(draft.original_price)
          const discountRate = parseNumber(draft.discount_rate)
          const discounted =
            originalPrice > 0
              ? computeDiscountedPrice(originalPrice, discountRate)
              : null
          return discounted !== null ? (
            <div className="mb-3 rounded-lg border border-[#6C47FF]/15 bg-[#6C47FF]/5 px-3 py-2 text-sm text-neutral-800">
              할인가: <span className="font-semibold">{formatKRW(discounted)}</span>
            </div>
          ) : null
        })()}
        <div className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <div className="text-xs font-medium text-neutral-600">카테고리</div>
              <select
                value={draft.category}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    category: e.target.value as ProductCategory,
                  }))
                }
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none ring-[#6C47FF]/15 focus:ring-4"
                disabled={saving}
              >
                <option value="matching_ticket">매칭권</option>
                <option value="pt_ticket">피티권</option>
              </select>
            </label>

            <label className="block">
              <div className="text-xs font-medium text-neutral-600">상품명</div>
              <input
                value={draft.title}
                onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="상품명을 입력해 주세요"
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none ring-[#6C47FF]/15 focus:ring-4"
                disabled={saving}
              />
            </label>

            <label className="block">
              <div className="text-xs font-medium text-neutral-600">매칭권 수</div>
              <input
                inputMode="numeric"
                value={draft.ticket_count}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, ticket_count: e.target.value }))
                }
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none ring-[#6C47FF]/15 focus:ring-4"
                disabled={saving}
              />
            </label>

            <label className="block">
              <div className="text-xs font-medium text-neutral-600">원가</div>
              <input
                inputMode="numeric"
                value={draft.original_price}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, original_price: e.target.value }))
                }
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none ring-[#6C47FF]/15 focus:ring-4"
                disabled={saving}
              />
            </label>

            <label className="block">
              <div className="text-xs font-medium text-neutral-600">할인율(%)</div>
              <input
                inputMode="numeric"
                value={draft.discount_rate}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, discount_rate: e.target.value }))
                }
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none ring-[#6C47FF]/15 focus:ring-4"
                disabled={saving}
              />
            </label>

            <label className="block">
              <div className="text-xs font-medium text-neutral-600">
                가격(자동 계산)
              </div>
              <input
                inputMode="numeric"
                value={
                  parseNumber(draft.original_price) > 0
                    ? String(
                        computeDiscountedPrice(
                          parseNumber(draft.original_price),
                          parseNumber(draft.discount_rate),
                        ),
                      )
                    : draft.price
                }
                onChange={(e) => setDraft((prev) => ({ ...prev, price: e.target.value }))}
                className="mt-1 w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 outline-none ring-[#6C47FF]/15 focus:ring-4"
                disabled={saving || parseNumber(draft.original_price) > 0}
              />
              <div className="mt-1 text-[11px] text-neutral-500">
                원가가 0보다 크면 할인율로 자동 계산됩니다.
              </div>
            </label>

            <label className="block">
              <div className="text-xs font-medium text-neutral-600">추가 포인트</div>
              <input
                inputMode="numeric"
                value={draft.bonus_points}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, bonus_points: e.target.value }))
                }
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none ring-[#6C47FF]/15 focus:ring-4"
                disabled={saving}
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              onClick={closeModal}
              disabled={saving}
            >
              취소
            </button>
            <button
              className="rounded-md bg-[#6C47FF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B3CF0] disabled:opacity-50"
              onClick={() => void save()}
              disabled={saving}
            >
              저장하기
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
