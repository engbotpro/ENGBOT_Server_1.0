import { Router } from 'express';
import { calcCompoundInterest, getCompoundInterest, deleteCompoundInterest, calcFinancialIndependence, getFinancialIndependence, deleteFinancialIndependence, calcSpending, getSpending } from '../controllers/calculateController';

const router = Router();

// define o caminho /compound-interest aqui,
// e depois montamos o router em /api no app.ts
router.post('/compound-interest', calcCompoundInterest);
router.get('/compound-interest/:userId', getCompoundInterest);
router.delete('/compound-interest/:userId', deleteCompoundInterest);

router.post('/FinancialIndependence', calcFinancialIndependence);
router.get('/FinancialIndependence/:userId', getFinancialIndependence);
router.delete('/FinancialIndependence/:userId', deleteFinancialIndependence);

router.post('/spending/:userId', calcSpending);
router.get('/spending/:userId', getSpending);

export default router;
