import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as api from './api';
import App from './App';

const renderAt = (path) => {
  window.history.pushState({}, '', path);
  return render(<App />);
};
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

function setup() {
  const sellerToken = api.__signIn({
    name: 'Mutinta',
    phone: '0977700700',
    accountType: 'seller',
    shop: {
      id: 'shop_fans',
      name: 'Mutinta Appliances',
      province: 'lusaka',
      town: 'Lusaka',
      area: 'Cairo Road',
      phone: '0977700700',
      couriers: ['pickup', 'seller'],
    },
  });
  const ownerToken = api.__signIn({ name: 'Noah', phone: '0976557939', admin: true });
  return { sellerToken, ownerToken };
}

test('a staff account signs in to the admin panel and cannot open a shop', async () => {
  setup();
  api.setToken(null);
  const page = renderAt('/login');
  type('Phone number', '0976557939');
  fireEvent.click(screen.getByRole('button', { name: 'Send me a code' }));
  type(await screen.findByLabelText('6-digit code').then(() => '6-digit code'), '123456');
  fireEvent.click(screen.getAllByRole('button', { name: 'Sign in' }).at(-1));
  expect(await screen.findByText('Needs attention')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/admin');
  page.unmount();

  renderAt('/sell#register');
  expect(await screen.findByText("Staff accounts can't have a shop")).toBeInTheDocument();
});

test('staff fix a shop’s details with a reason the shop sees', async () => {
  const { ownerToken } = setup();
  api.setToken(ownerToken);
  renderAt('/admin?tab=shops');
  fireEvent.change(await screen.findByLabelText('Status'), { target: { value: '' } });
  const card = (await screen.findByRole('link', { name: 'Mutinta Appliances' })).closest('.order');
  fireEvent.click(within(card).getByRole('button', { name: '✎ Edit details' }));
  type(await screen.findByLabelText(/Reason for the change/).then(() => /Reason for the change/), 'Name as on PACRA certificate');
  type('Shop name', 'Mutinta Home Appliances');
  fireEvent.click(screen.getByRole('button', { name: 'Save shop details' }));
  await waitFor(() => expect(api.__db().shops.find((s) => s.id === 'shop_fans').name).toBe('Mutinta Home Appliances'));
  expect(api.__db().notifications[0].title).toBe('Zed Market updated your shop details');
});

test('only owners add staff and change settings', async () => {
  const { ownerToken } = setup();
  api.setToken(ownerToken);
  const owner = renderAt('/admin?tab=staff');
  type(await screen.findByLabelText('Staff phone').then(() => 'Staff phone'), '0955123456');
  type('Staff name', 'Mapalo');
  fireEvent.click(screen.getByRole('button', { name: 'Add staff' }));
  expect(await screen.findByText('Mapalo')).toBeInTheDocument();
  owner.unmount();

  const settings = renderAt('/admin?tab=settings');
  type(await screen.findByLabelText('Commission on goods sold (%)').then(() => 'Commission on goods sold (%)'), '7.5');
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  await waitFor(() => expect(api.__db().settings.commissionRate).toBe(0.075));
  settings.unmount();

  // The new staff member can see the settings but not change them.
  const staffUser = api.__db().users.find((u) => u.name === 'Mapalo');
  api.__db().sessions.tok_staff = staffUser.id;
  api.setToken('tok_staff');
  renderAt('/admin?tab=settings');
  expect(await screen.findByText('Only owners can change these.')).toBeInTheDocument();
  expect(screen.getByLabelText('Commission on goods sold (%)')).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument();
});

test('staff mark a parcel delivered for a shop', async () => {
  const { ownerToken } = setup();
  api.__db().orders.push({
    id: 'ZM-PHONE1',
    buyerId: 'usr_1',
    date: new Date().toISOString(),
    buyer: { name: 'Chipo', phone: '0966111000' },
    payment: 'MTN Mobile Money',
    paid: true,
    total: 500,
    shipping: { province: 'lusaka', town: 'Lusaka' },
    shipments: [{ shopId: 'shop_fans', shopName: 'Mutinta Appliances', status: 'dispatched', courierName: 'Platinum', items: [] }],
  });
  api.setToken(ownerToken);
  renderAt('/admin?tab=orders');
  const order = (await screen.findByText('ZM-PHONE1')).closest('.order');
  fireEvent.click(within(order).getByRole('button', { name: 'Mark as delivered' }));
  type('Mark as delivered: reason', 'Platinum confirmed by phone');
  fireEvent.click(within(order).getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(api.__db().orders[0].shipments[0].status).toBe('delivered'));
});
