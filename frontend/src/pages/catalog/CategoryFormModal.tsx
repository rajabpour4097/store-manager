import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { SelectInput, Switch, TextArea, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/contexts/ToastContext'
import { ApiError } from '@/services/api'
import { catalogApi } from '@/services/endpoints'
import type { ProductCategory } from '@/types'

interface CategoryFormModalProps {
  open: boolean
  category: ProductCategory | null
  categories: ProductCategory[]
  onClose: () => void
  onSaved: () => void
}

export function CategoryFormModal({
  open,
  category,
  categories,
  onClose,
  onSaved,
}: CategoryFormModalProps) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [parent, setParent] = useState('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(category?.name ?? '')
    setParent(category?.parent ? String(category.parent) : '')
    setDescription(category?.description ?? '')
    setIsActive(category?.is_active ?? true)
    setErrors({})
  }, [open, category])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setErrors({ name: ['نام دسته الزامی است.'] })
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        parent: parent ? Number(parent) : null,
        description: description.trim(),
        is_active: isActive,
      }
      if (category) {
        await catalogApi.updateCategory(category.id, payload)
        toast.success('دسته‌بندی ویرایش شد.')
      } else {
        await catalogApi.createCategory(payload)
        toast.success('دسته‌بندی ساخته شد.')
      }
      onSaved()
      onClose()
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors)
        toast.error(error.message)
      } else {
        toast.error('ثبت انجام نشد.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={category ? 'ویرایش دسته‌بندی کالا' : 'دسته‌بندی جدید کالا'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            ذخیره
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextInput label="نام دسته" required value={name} onChange={setName} error={errors.name} />
        <SelectInput
          label="دسته والد"
          value={parent}
          onChange={setParent}
          options={categories
            .filter((item) => item.id !== category?.id)
            .map((item) => ({ value: item.id, label: item.full_name || item.name }))}
          placeholder="بدون والد (دسته اصلی)"
          error={errors.parent}
        />
        <TextArea
          label="توضیحات"
          value={description}
          onChange={setDescription}
          error={errors.description}
          rows={2}
        />
        <Switch label="فعال" checked={isActive} onChange={setIsActive} />
      </form>
    </Modal>
  )
}
