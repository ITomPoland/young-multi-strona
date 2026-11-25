import tshirtUrl from '../assets/tshirt.avif';
import hoodie1Url from '../assets/hoodie1.avif';
import hoodie2Url from '../assets/hoodie2.avif';

// Single source of truth for S7: Selected Goods (Archival Lost Media Drop)
export const MERCH_ITEMS = [
  {
    id: 'lost-media-box',
    index: '01',
    code: 'YFL // LM-001',
    category: 'COLLECTOR EDITION',
    name: 'LOST MEDIA BOX',
    price: 'PRE-ORDER',
    status: '11.12.2026',
    statusType: 'live',
    note: 'Fizyczne wydanie kolekcjonerskie. Etui archiwalne z lakierem UV + płyta z zapisem klinicznym.',
    cta: 'ZOBACZ W SKLEPIE YFL',
    link: 'https://sklep.yfl.pl',
    is3DBox: true
  },
  {
    id: 'stealth-era-tee',
    index: '02',
    code: 'YFL // ARCHIVE-02',
    category: 'HEAVY COTTON TEE',
    name: 'STEALTH ERA T-SHIRT',
    price: '179,00 ZŁ',
    status: 'WYPRZEDANE',
    statusType: 'sold',
    note: 'Czarny oversize z tonalnym wypukłym nadrukiem „THANK GOD 4 LIVING IN YOUNG MULTI ERA”.',
    cta: 'ZOBACZ DROP',
    link: 'https://sklep.yfl.pl/products/yfl-basic-tshirt-1',
    imgUrl: tshirtUrl
  },
  {
    id: 'yfl-patch-hoodie',
    index: '03',
    code: 'YFL // ARCHIVE-03',
    category: 'ZIP HOODIE · PATCHED',
    name: 'YFL PATCH HOODIE',
    price: '499,00 ZŁ',
    status: 'WYPRZEDANE',
    statusType: 'sold',
    note: 'Ciężka rozpinana bluza boxy z metalowym zamkiem YFL i tonalnymi naszywkami na rękawach.',
    cta: 'ZOBACZ DROP',
    link: 'https://sklep.yfl.pl/products/yfl-limited-hoodie',
    imgUrl: hoodie1Url
  },
  {
    id: 'yfl-embossed-hoodie',
    index: '04',
    code: 'YFL // ARCHIVE-04',
    category: 'ZIP HOODIE · MINIMAL',
    name: 'YFL EMBOSSED HOODIE',
    price: '459,00 ZŁ',
    status: 'WYPRZEDANE',
    statusType: 'sold',
    note: 'Minimalistyczna rozpinana bluza YFL w głębokiej czerni z surowym tłoczeniem i metalowym suwakiem.',
    cta: 'ZOBACZ DROP',
    link: 'https://sklep.yfl.pl/products/yfl-hoodie',
    imgUrl: hoodie2Url
  }
];
