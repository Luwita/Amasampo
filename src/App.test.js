import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as api from './api';
import App from './App';

const renderAt = (path) => {
  window.history.pushState({}, '', path);
  return render(<App />);
};

const type = (label, value, options) => fireEvent.change(screen.getByLabelText(label, options), { target: { value } });

test('renders the Amasampo storefront with products from the API', async () => {
  renderAt('/');
  expect(screen.getByRole('search')).toBeInTheDocument();
  expect(await screen.findAllByText(/Tecno Spark 20 Pro/)).not.toHaveLength(0);
  expect(screen.getByText(/Flash deals/i, { selector: 'h2' })).toBeInTheDocument();
});

test('filters products by province and town', async () => {
  renderAt('/shop?prov=western&town=Mongu');
  expect(await screen.findByText(/Chitenge Fabric/)).toBeInTheDocument();
  expect(screen.getByText(/products in Mongu/)).toBeInTheDocument();
  expect(screen.queryByText(/Tecno Spark/)).not.toBeInTheDocument();
});

test('signing up as a shop owner with an SMS code leads to shop setup, then uploading a product', async () => {
  renderAt('/login');
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  type('Full name', 'Mwansa Banda');
  type('I am a', 'seller');
  type('Phone number', '0977 123 456');
  fireEvent.click(screen.getByRole('button', { name: 'Send me a code' }));

  expect(await screen.findByText(/Your code is/)).toHaveTextContent('123456');
  type('6-digit code', '123456');
  fireEvent.click(screen.getAllByRole('button', { name: 'Create account' })[1]);

  // Lands on shop setup with name and phone filled in.
  expect(await screen.findByRole('heading', { name: 'Open your shop', level: 2 })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/sell');
  expect(screen.getByLabelText('Your name')).toHaveValue('Mwansa Banda');
  expect(screen.getByLabelText('Phone (WhatsApp)')).toHaveValue('0977123456');

  type('Shop name', 'Mwansa Hardware');
  type('Province', 'eastern', { selector: '#shop-province' });
  type('Street, market or area', 'Chipata Market');
  fireEvent.click(screen.getByRole('button', { name: 'Open my shop' }));

  expect(await screen.findByRole('heading', { name: 'Upload a product' })).toBeInTheDocument();
  type('Product name', 'Hoe Handle (Mukwa)');
  type('Category', 'agri');
  type('Quantity in stock', '40');
  type('Price (K)', '75');
  fireEvent.click(screen.getByRole('button', { name: 'Publish product' }));
  expect(await screen.findByText(/Enter the weight of one unit/)).toBeInTheDocument();
  type('Weight per unit (kg)', '1.2');
  fireEvent.click(screen.getByRole('button', { name: 'Publish product' }));

  await waitFor(() => expect(document.querySelector('.seller-products')).toBeInTheDocument());
  expect(within(document.querySelector('.seller-products')).getByText('Hoe Handle (Mukwa)')).toBeInTheDocument();
  expect(api.__db().products.find((p) => p.name === 'Hoe Handle (Mukwa)').price).toBe(75);

  fireEvent.click(screen.getAllByRole('link', { name: 'Eastern' })[0]);
  expect((await screen.findAllByText('Hoe Handle (Mukwa)')).length).toBeGreaterThan(0);
});

test('checkout asks guests to sign in first', async () => {
  localStorage.setItem('amasampo.cart', JSON.stringify([{ id: 'p1', qty: 1 }]));
  renderAt('/checkout');
  expect(await screen.findByText('Sign in to check out')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in with your phone' })).toHaveAttribute(
    'href',
    '/login?next=/checkout',
  );
});

test('buyer checks out with a courier and the shop owner dispatches the order', async () => {
  const sellerToken = api.__signIn({
    name: 'Bupe',
    phone: '0966111222',
    accountType: 'seller',
    shop: {
      id: 'shop_kitwe',
      name: 'Bupe Electronics',
      province: 'copperbelt',
      town: 'Kitwe',
      area: 'Parklands',
      phone: '0966111222',
      couriers: ['pickup', 'yango'],
    },
  });
  api.__addProduct({
    id: 'prd_charger',
    shopId: 'shop_kitwe',
    name: 'Phone Charger',
    category: 'phones',
    price: 120,
    stock: 10,
  });
  api.__signIn({ name: 'Chanda Phiri', phone: '0977000111' });
  localStorage.setItem('amasampo.location', JSON.stringify({ province: 'copperbelt', town: 'Kitwe' }));
  localStorage.setItem('amasampo.cart', JSON.stringify([{ id: 'prd_charger', qty: 2 }]));

  const buyer = renderAt('/checkout');
  expect(await screen.findByLabelText(/Yango Delivery/)).toBeChecked(); // cheapest door delivery is preselected
  type('Street address or landmark', 'Plot 5, Riverside');
  fireEvent.click(screen.getByRole('button', { name: /Pay K285/ })); // 2 × K120 + K45 Yango
  expect(await screen.findByText(/Your order is confirmed/)).toBeInTheDocument();
  expect(api.__db().products.find((p) => p.id === 'prd_charger').stock).toBe(8);
  buyer.unmount();

  // The shop owner signs in on their own device and dispatches.
  api.setToken(sellerToken);
  renderAt('/seller?tab=orders');
  expect(await screen.findByText(/2 × Phone Charger/)).toBeInTheDocument();
  type('Tracking number', 'YG-4471');
  fireEvent.click(screen.getByRole('button', { name: 'Hand over to Yango Delivery' }));
  expect(await screen.findByText('YG-4471')).toBeInTheDocument();
  expect(screen.getAllByText(/Sent with Yango Delivery/).length).toBeGreaterThan(0);
});

test('search understands local words', async () => {
  renderAt('/shop?q=nshima');
  expect(await screen.findByText(/Breakfast Mealie Meal/)).toBeInTheDocument();
});

test('products with sizes ask the buyer to choose before adding to cart', async () => {
  renderAt('/product/p16'); // shirts in sizes S–XXL
  expect(await screen.findByRole('radiogroup', { name: 'Size' })).toBeInTheDocument();
  fireEvent.click(within(document.querySelector('.pdp-buttons')).getByRole('button', { name: 'Add to cart' }));
  expect(screen.getByText('Choose a size')).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem('amasampo.cart'))).toEqual([]);

  fireEvent.click(screen.getByRole('radio', { name: 'M' }));
  fireEvent.click(within(document.querySelector('.pdp-buttons')).getByRole('button', { name: 'Add to cart' }));
  expect(JSON.parse(localStorage.getItem('amasampo.cart'))).toEqual([{ id: 'p16', qty: 1, options: { Size: 'M' } }]);

  fireEvent.click(screen.getByRole('link', { name: /Cart/ }));
  expect(await screen.findByText('Size: M')).toBeInTheDocument();
});

test('delivery prices on the product page follow the quantity being bought', async () => {
  localStorage.setItem('amasampo.location', JSON.stringify({ province: 'lusaka', town: 'Lusaka' }));
  renderAt('/product/p12'); // 25 kg lithium battery from Ndola
  expect(await screen.findByText(/Prices for 25 kg/)).toBeInTheDocument();
  expect(screen.getByText(/Too heavy for/)).toBeInTheDocument();
});

test('buyers can rate an item after delivery, once', async () => {
  api.__signIn({ name: 'Chanda', phone: '0977000111' });
  const order = await api.placeOrder({
    items: [{ productId: 'p10', qty: 1 }],
    shipping: { name: 'Chanda', phone: '0977000111', province: 'lusaka', town: 'Lusaka', address: 'Plot 1' },
    couriers: { s2: 'pickup' },
    payment: 'mtn',
  });
  api.__db().orders[0].shipments[0].status = 'delivered';

  renderAt('/account');
  fireEvent.click(await screen.findByRole('button', { name: '★ Rate this item' }));
  fireEvent.click(screen.getByRole('radio', { name: '4 stars' }));
  fireEvent.change(screen.getByLabelText('Your review'), { target: { value: 'Works well in load-shedding' } });
  fireEvent.click(screen.getByRole('button', { name: 'Post review' }));

  expect(await screen.findByText(/You rated/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '★ Rate this item' })).not.toBeInTheDocument();
  const review = api.__db().reviews[0];
  expect(review).toMatchObject({ orderId: order.id, productId: 'p10', rating: 4, author: 'Chanda' });
});

test('a shop owner without a shop sees a setup prompt on their account', async () => {
  api.__signIn({ name: 'Bupe', phone: '0966000111', accountType: 'seller' });
  renderAt('/account');
  expect(await screen.findByText('Finish setting up your shop')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Set up my shop' })).toHaveAttribute('href', '/sell#register');
});

test.each([
  '/wholesale',
  '/shop?q=solar',
  '/product/p10',
  '/cart',
  '/stores',
  '/stores?prov=luapula',
  '/store/s13',
  '/delivery',
  '/logistics',
  '/sell',
  '/seller',
  '/login',
  '/account',
  '/nowhere',
])('%s renders without crashing', async (path) => {
  renderAt(path);
  await waitFor(() => expect(document.querySelector('.status-bar')).not.toBeInTheDocument());
  expect(document.querySelector('main').textContent.length).toBeGreaterThan(10);
});
