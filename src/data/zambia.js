// The 10 provinces of Zambia and the main towns in each.
export const provinces = [
  { id: 'lusaka', name: 'Lusaka', towns: ['Lusaka', 'Chongwe', 'Kafue', 'Chilanga', 'Chirundu', 'Luangwa', 'Rufunsa'] },
  {
    id: 'copperbelt',
    name: 'Copperbelt',
    towns: ['Ndola', 'Kitwe', 'Chingola', 'Mufulira', 'Luanshya', 'Chililabombwe', 'Kalulushi', 'Masaiti'],
  },
  { id: 'central', name: 'Central', towns: ['Kabwe', 'Kapiri Mposhi', 'Mkushi', 'Serenje', 'Mumbwa', 'Chibombo'] },
  {
    id: 'southern',
    name: 'Southern',
    towns: ['Livingstone', 'Choma', 'Mazabuka', 'Monze', 'Kalomo', 'Siavonga', 'Kazungula', 'Namwala'],
  },
  { id: 'eastern', name: 'Eastern', towns: ['Chipata', 'Petauke', 'Katete', 'Lundazi', 'Nyimba', 'Chadiza'] },
  { id: 'northern', name: 'Northern', towns: ['Kasama', 'Mbala', 'Mpulungu', 'Luwingu', 'Mporokoso', 'Kaputa'] },
  { id: 'muchinga', name: 'Muchinga', towns: ['Chinsali', 'Mpika', 'Nakonde', 'Isoka', 'Chama'] },
  { id: 'luapula', name: 'Luapula', towns: ['Mansa', 'Samfya', 'Kawambwa', 'Nchelenge', 'Mwense'] },
  {
    id: 'northwestern',
    name: 'North-Western',
    towns: ['Solwezi', 'Kasempa', 'Mwinilunga', 'Zambezi', 'Kabompo', 'Kalumbila'],
  },
  { id: 'western', name: 'Western', towns: ['Mongu', 'Senanga', 'Kaoma', 'Sesheke', 'Kalabo', 'Lukulu'] },
];

export const getProvince = (id) => provinces.find((p) => p.id === id);

export const formatLocation = ({ province, town }) => `${town}, ${getProvince(province)?.name ?? ''}`;

export const DEFAULT_LOCATION = { province: 'lusaka', town: 'Lusaka' };
