import { STATUS_META } from '@core/constants'
import { buildLogicNodes, describeWindow, describeBatchRule } from '@core/logicTree'
import { useRules } from '../lib/rulesContext'

// A leaf: either a status outcome (blue-ish status pill) or a "keep going" fall-through.
function Outcome({ value }) {
  if (typeof value === 'object') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300 ring-1 ring-gray-200 dark:ring-gray-600">
        ↓ {value.fall}
      </span>
    )
  }
  const meta = STATUS_META[value]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.badge}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />
      {meta.label}
    </span>
  )
}

// One labelled branch hanging off a vertical guide via an elbow tick.
function BranchRow({ label, muted, children }) {
  return (
    <li className="relative pl-6">
      <span className="absolute left-0 top-3 w-5 h-px bg-gray-300 dark:bg-gray-600" aria-hidden />
      <div className="flex items-start gap-2 py-0.5">
        <span className={`mt-1 text-[10px] font-bold uppercase tracking-wider ${muted ? 'text-rose-400 dark:text-rose-400/80' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {label}
        </span>
        <div className="min-w-0">{children}</div>
      </div>
    </li>
  )
}

// Vertical guide that the BranchRow elbows hang from.
function Branches({ children }) {
  return (
    <ul className="relative mt-1.5 ml-1.5">
      <span className="absolute left-0 top-0 bottom-3 w-px bg-gray-300 dark:bg-gray-600" aria-hidden />
      {children}
    </ul>
  )
}

// A nested decision reached on a parent's "yes" branch: an orange sub-node then two leaves.
function SubDecision({ sub }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-orange-400 dark:bg-orange-500 ring-2 ring-orange-100 dark:ring-orange-900/40 shrink-0" aria-hidden />
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{sub.q}</span>
      </div>
      <Branches>
        <BranchRow label="yes"><Outcome value={sub.yes} /></BranchRow>
        <BranchRow label="no" muted><Outcome value={sub.no} /></BranchRow>
      </Branches>
    </div>
  )
}

function Gate({ node, isLast }) {
  return (
    <div className="flex gap-3">
      {/* Trunk: orange decision node + the "no" connector down to the next gate */}
      <div className="flex flex-col items-center shrink-0">
        <span className="mt-1 w-4 h-4 rounded-full bg-orange-400 dark:bg-orange-500 ring-4 ring-orange-100 dark:ring-orange-900/30 z-10" aria-hidden />
        {!isLast && (
          <div className="relative flex-1 w-px bg-gray-300 dark:bg-gray-600 my-1">
            <span className="absolute top-1/2 left-1.5 -translate-y-1/2 text-[9px] font-bold uppercase tracking-wider text-rose-400 dark:text-rose-400/80">no</span>
          </div>
        )}
      </div>

      {/* Gate content + its yes-branch(es) */}
      <div className={isLast ? 'flex-1 min-w-0' : 'flex-1 min-w-0 pb-6'}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded">
            {node.col}
          </span>
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{node.q}?</span>
        </div>
        {node.note && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">{node.note}</p>
        )}

        {node.terminal ? (
          <Branches>
            <BranchRow label="yes"><Outcome value={node.yes} /></BranchRow>
            <BranchRow label="no" muted><Outcome value={node.no} /></BranchRow>
          </Branches>
        ) : node.sub ? (
          <Branches>
            <BranchRow label="yes"><SubDecision sub={node.sub} /></BranchRow>
          </Branches>
        ) : (
          <Branches>
            <BranchRow label="yes"><Outcome value={node.yes} /></BranchRow>
          </Branches>
        )}
      </div>
    </div>
  )
}

export default function LogicModal({ onClose }) {
  const rules = useRules()
  const NODES = buildLogicNodes(rules)
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1100] p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">How venues get classified</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">First gate that matches wins — the orange trunk continues on "no"</p>
          </div>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">
          {/* Root */}
          <div className="flex gap-3">
            <div className="flex flex-col items-center shrink-0">
              <span className="mt-1 w-4 h-4 rounded-full bg-gray-700 dark:bg-gray-200 ring-4 ring-gray-200 dark:ring-gray-700 z-10" aria-hidden />
              <div className="flex-1 w-px bg-gray-300 dark:bg-gray-600 my-1 min-h-[14px]" />
            </div>
            <div className="flex-1 min-w-0 pb-6">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5">Every venue</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Evaluated top to bottom.</p>
            </div>
          </div>

          {NODES.map((node, i) => (
            <Gate key={i} node={node} isLast={i === NODES.length - 1} />
          ))}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-xl">
          <div className="flex items-center gap-4 mb-1.5 text-[11px] text-gray-400 dark:text-gray-500">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-400" /> gate</span>
            <span className="inline-flex items-center gap-1.5"><span className="text-emerald-600 dark:text-emerald-400 font-bold">yes</span> / <span className="text-rose-400 font-bold">no</span> branch</span>
            <span className="inline-flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700">pill</span> outcome</span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {describeWindow(rules)} {describeBatchRule(rules)}{' '}
            "Action needed" = Send + Follow Up + Never Contacted.
          </p>
        </div>
      </div>
    </div>
  )
}
