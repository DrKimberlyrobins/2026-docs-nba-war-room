import copy
from datetime import datetime, timedelta, timezone
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('builder',Path(__file__).resolve().parents[1]/'scripts/build.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)


class SimulatorTests(unittest.TestCase):
    def setUp(self):
        self.now=datetime.now(timezone.utc)
        self.history=[]
        for i in range(40):
            tip=b.stamp(self.now-timedelta(days=i+2))
            aq=[22+i%9,24+i%7,25+i%6,20+i%12];hq=[25+i%7,23+i%11,26+i%4,23+i%8]
            self.history.append({'id':str(i),'tip':tip,'season':'current' if i<6 else 'prior',
                'away':{'teamId':'A' if i%2 else 'B','quarters':aq,'score':sum(aq)},
                'home':{'teamId':'B' if i%2 else 'A','quarters':hq,'score':sum(hq)}})
        self.game={'id':'100','tip':b.stamp(self.now+timedelta(hours=2)),'date':'2026-10-30','name':'A at B',
                   'state':'pre','completed':False,'neutral':False,
                   'away':{'id':'A','name':'Away','abbr':'A','score':None,'quarters':[]},
                   'home':{'id':'B','name':'Home','abbr':'B','score':None,'quarters':[]},
                   'market':{'homeSpread':-3.5,'total':215.5,'provider':'Test','fetchedAt':b.stamp(self.now)}}

    def test_exactly_10000_and_coherent_periods(self):
        sim=b.simulate(self.game,self.history,self.now)
        self.assertEqual(sim['runs'],10000)
        for p in sim['periods'].values():
            self.assertEqual(p['awayWins']+p['homeWins']+p['ties'],10000)
            for key in ('away','home','total','margin'):
                self.assertEqual(sum(c for v,c in p[key]['hist']),10000)
            self.assertAlmostEqual(p['away']['mean']+p['home']['mean'],p['total']['mean'],delta=.02)
        for side in ('away','home','total'):
            means=[sim['periods'][p][side]['mean'] for p in ('q1','h1','full')]
            self.assertEqual(means,sorted(means))

    def test_future_results_cannot_change_forecast(self):
        first=b.simulate(self.game,self.history,self.now)
        future=copy.deepcopy(self.history[0]);future['id']='future';future['tip']=b.stamp(self.now+timedelta(days=1));future['away']['quarters']=[100]*4
        self.assertEqual(first,b.simulate(self.game,self.history+[future],self.now))

    def test_market_changes_do_not_change_simulated_scores(self):
        first=b.simulate(self.game,self.history,self.now)
        changed=copy.deepcopy(self.game);changed['market']['homeSpread']=8.5;changed['market']['total']=250
        second=b.simulate(changed,self.history,self.now)
        self.assertEqual(first['seed'],second['seed'])
        self.assertEqual(first['periods']['full']['total'],second['periods']['full']['total'])
        self.assertNotEqual(first['periods']['full']['spread'],second['periods']['full']['spread'])

    def test_market_uses_signed_home_close(self):
        comp={'odds':[{'provider':{'name':'Test'},'spread':1.5,'overUnder':218.5,
                       'pointSpread':{'home':{'close':{'line':'+1.5'}}},'awayTeamOdds':{'favorite':True}}]}
        market=b.parse_market(comp,'now','source')
        self.assertEqual(market['homeSpread'],1.5)
        comp['odds'][0].pop('pointSpread')
        self.assertEqual(b.parse_market(comp,'now','source')['homeSpread'],1.5)
        comp['odds'][0]['awayTeamOdds']['favorite']=False;comp['odds'][0]['homeTeamOdds']={'favorite':True}
        self.assertEqual(b.parse_market(comp,'now','source')['homeSpread'],-1.5)

    def test_pushes_and_spread_sign(self):
        import numpy as np
        self.assertEqual(b.probability(np.array([10,8,3]),-8,'spread'),{'win':1,'loss':1,'push':1})

    def test_receipts_preserve_first_and_freeze_after_tip(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            payload=(self.history,[self.game],[],[],{})
            with patch.object(b,'collect',return_value=payload):b.build(root,self.now,self.now.date())
            path=root/'data/receipts/100.json';first=b.read(path)
            changed=copy.deepcopy(self.game);changed['market']['total']=230
            with patch.object(b,'collect',return_value=(self.history,[changed],[],[],{})):b.build(root,self.now+timedelta(minutes=30),self.now.date())
            revised=b.read(path);self.assertEqual(first['first'],revised['first']);self.assertNotEqual(first['latest'],revised['latest'])
            final=copy.deepcopy(changed);final.update(state='post',completed=True);final['away'].update(score=110,quarters=[25,25,30,30]);final['home'].update(score=100,quarters=[25,25,25,25])
            with patch.object(b,'collect',return_value=(self.history,[final],[],[],{})):result=b.build(root,self.now+timedelta(hours=6),self.now.date())
            self.assertEqual(revised['latest'],b.read(path)['latest']);self.assertEqual(result['metrics']['gradedGames'],1)

    def test_first_forecast_after_tip_is_never_created(self):
        with tempfile.TemporaryDirectory() as tmp:
            game=copy.deepcopy(self.game);game['state']='in'
            with patch.object(b,'collect',return_value=(self.history,[game],[],[],{})):
                result=b.build(Path(tmp),self.now+timedelta(hours=3),self.now.date())
            self.assertEqual(result['forecasts'][0]['simulation']['status'],'no_pregame_receipt')
            self.assertFalse((Path(tmp)/'data/receipts/100.json').exists())

    def test_posttip_snapshot_not_graded(self):
        self.assertIsNone(b.grade({'savedAt':self.game['tip']},self.game))


if __name__=='__main__':unittest.main()
