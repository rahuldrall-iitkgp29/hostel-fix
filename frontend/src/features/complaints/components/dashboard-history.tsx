import Link from 'next/link';
import type {
  ActivityItem,
  AdminDashboardData,
  StaffDashboardData,
} from '../types';
import { Card } from '@/components/ui/card';
function RecentActivity({ entries }: { entries: ActivityItem[] }) {
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold">Recent activity</h2>
      {entries.length ? (
        entries.map((entry) => (
          <Link
            key={entry.id}
            href={`/complaints/${entry.complaintId}`}
            className="block border-b border-line pb-2 text-sm"
          >
            <span>
              {entry.type.replaceAll('_', ' ')}
              {entry.actor ? ` — ${entry.actor.name}` : ''}
            </span>
            <time className="ml-2 text-xs text-muted">
              {new Date(entry.occurredAt).toLocaleString()}
            </time>
          </Link>
        ))
      ) : (
        <p className="text-sm text-muted">No recent activity.</p>
      )}
    </Card>
  );
}
export function AdminDashboardHistory({ data }: { data: AdminDashboardData }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Total complaints', data.total],
          ['Resolved / closed', data.resolved + data.closed],
          [
            'Assigned / in progress',
            data.statusCounts.ASSIGNED + data.statusCounts.IN_PROGRESS,
          ],
        ].map(([label, count]) => (
          <Card key={label} className="p-5">
            <p className="text-sm">{label}</p>
            <p className="text-2xl font-semibold">{count}</p>
          </Card>
        ))}
      </div>
      {data.priorityCounts && (
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Priority distribution</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(data.priorityCounts).map(([priority, count]) => (
              <div key={priority}>
                <p className="text-xs text-muted">{priority}</p>
                <p className="text-xl font-semibold">{count}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
      {data.hostelBreakdown && (
        <Card className="overflow-x-auto">
          <h2 className="mb-3 text-lg font-semibold">Hostel breakdown</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[
                  'Hostel',
                  'Total',
                  'Open',
                  'Unassigned',
                  'Assigned',
                  'In progress',
                  'Resolved / closed',
                ].map((title) => (
                  <th key={title} className="p-2">
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.hostelBreakdown.map((hostel) => (
                <tr key={hostel.hostelId} className="border-t border-line">
                  <td className="p-2">{hostel.name}</td>
                  {[
                    hostel.total,
                    hostel.open,
                    hostel.unassigned,
                    hostel.assigned,
                    hostel.inProgress,
                    hostel.resolved + hostel.closed,
                  ].map((count, index) => (
                    <td key={index} className="p-2">
                      {count}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {data.recentActivity && <RecentActivity entries={data.recentActivity} />}
    </div>
  );
}
export function StaffDashboardHistory({ data }: { data: StaffDashboardData }) {
  return (
    <div className="space-y-5">
      {data.resolutionHistory && (
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Recent resolution history</h2>
          {data.resolutionHistory.length ? (
            data.resolutionHistory.map((complaint) => (
              <Link
                key={complaint.id}
                href={`/complaints/${complaint.id}`}
                className="block border-b border-line pb-2 text-sm"
              >
                {complaint.reference} — {complaint.title}{' '}
                <span className="text-muted">({complaint.status})</span>
              </Link>
            ))
          ) : (
            <p className="text-sm text-muted">No resolved work yet.</p>
          )}
        </Card>
      )}
      {data.latestActivity && <RecentActivity entries={data.latestActivity} />}
    </div>
  );
}
