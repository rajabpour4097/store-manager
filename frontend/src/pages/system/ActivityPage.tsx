import { History } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/Misc'
import { usePaginatedList } from '@/hooks/usePaginatedList'
import { usersApi } from '@/services/endpoints'
import type { ActivityLog } from '@/types'

export function ActivityPage() {
  const list = usePaginatedList<ActivityLog>((params) => usersApi.activityLogs(params), {
    pageSize: 25,
  })

  const columns: Array<Column<ActivityLog>> = [
    {
      key: 'time',
      header: 'زمان',
      render: (row) => (
        <span className="num text-xs">{row.created_at_jalali || row.created_at}</span>
      ),
    },
    {
      key: 'user',
      header: 'کاربر',
      render: (row) => row.user_name || '—',
    },
    {
      key: 'action',
      header: 'عملیات',
      render: (row) => <Badge tone="brand">{row.action_display || row.action}</Badge>,
    },
    {
      key: 'entity',
      header: 'موجودیت',
      render: (row) => (
        <span>
          {row.entity}
          {row.entity_id ? ` #${row.entity_id}` : ''}
        </span>
      ),
    },
    {
      key: 'desc',
      header: 'شرح',
      render: (row) => <span className="text-sm text-ink-600 dark:text-ink-300">{row.description}</span>,
    },
    {
      key: 'ip',
      header: 'IP',
      render: (row) => <span className="num text-xs">{row.ip_address || '—'}</span>,
    },
  ]

  return (
    <>
      <PageHeader
        title="گزارش فعالیت‌ها"
        description="ردپای عملیات کاربران در سامانه"
        icon={<History size={20} />}
      />

      <DataTable
        columns={columns}
        rows={list.items}
        loading={list.loading}
        rowKey={(r) => r.id}
        footer={
          <Pagination
            page={list.page}
            numPages={list.numPages}
            count={list.count}
            pageSize={list.pageSize}
            onChange={list.setPage}
          />
        }
      />
    </>
  )
}
