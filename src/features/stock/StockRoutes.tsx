import { Route, Routes } from 'react-router-dom';

import { CsvImport } from './CsvImport';
import { ProductDetail } from './ProductDetail';
import { ProductEditor } from './ProductEditor';
import { StockList } from './StockList';


export function StockRoutes() {
  return (
    <Routes>
      <Route index element={<StockList />} />
      <Route path="import" element={<CsvImport />} />
      <Route path="product/:id" element={<ProductEditor />} />
      <Route path="product/:id/detail" element={<ProductDetail />} />
    </Routes>
  );
}
