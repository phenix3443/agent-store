import { test, expect, afterEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import * as rpcModule from '../../lib/rpc'
import { EntitlementProvider } from '../../state/Entitlement'
import { ProGate } from '../ProGate'
import type { Entitlements } from '@as/types'

afterEach(() => {
  cleanup()
  mock.restore()
})

function mockPlan(entitlements: Entitlements) {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string) => {
    if (method === 'getEntitlements') return entitlements
    throw new Error(`unexpected RPC in ProGate test: ${method}`)
  }) as typeof rpcModule.callRpc)
}

test('renders the upsell (not the children) when the feature is gated', async () => {
  mockPlan({ plan: 'free', advancedUsageAnalytics: false, smartRouting: false, keyRotation: false })

  render(
    <EntitlementProvider>
      <ProGate feature="advancedUsageAnalytics" title="预算与超支告警">
        <div>SECRET_CONTENT</div>
      </ProGate>
    </EntitlementProvider>
  )

  expect(await screen.findByText('预算与超支告警')).toBeInTheDocument()
  expect(screen.getByText('Pro')).toBeInTheDocument()
  expect(screen.queryByText('SECRET_CONTENT')).not.toBeInTheDocument()
})

test('renders the children when the plan unlocks the feature', async () => {
  mockPlan({ plan: 'pro', advancedUsageAnalytics: true, smartRouting: true, keyRotation: true })

  render(
    <EntitlementProvider>
      <ProGate feature="advancedUsageAnalytics" title="预算与超支告警">
        <div>SECRET_CONTENT</div>
      </ProGate>
    </EntitlementProvider>
  )

  expect(await screen.findByText('SECRET_CONTENT')).toBeInTheDocument()
  expect(screen.queryByText('预算与超支告警')).not.toBeInTheDocument()
})

test('shows an upgrade button only when onUpgrade is given', async () => {
  mockPlan({ plan: 'free', advancedUsageAnalytics: false, smartRouting: false, keyRotation: false })
  const onUpgrade = mock(() => {})

  render(
    <EntitlementProvider>
      <ProGate feature="smartRouting" title="智能路由" onUpgrade={onUpgrade}>
        <div>SECRET_CONTENT</div>
      </ProGate>
    </EntitlementProvider>
  )

  fireEvent.click(await screen.findByRole('button', { name: '升级到 Pro' }))
  expect(onUpgrade).toHaveBeenCalledTimes(1)
})
