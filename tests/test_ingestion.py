import unittest, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import refresh_current as r
class IngestionTests(unittest.TestCase):
    def test_minutes(self):
        self.assertEqual(r.number('12:30'),12.5)
        self.assertIsNone(r.number('--'))
        self.assertIsNone(r.number('NaN'))
    def test_pairs(self):
        self.assertEqual(r.parse_stats(['FG','3PT','MIN'],['8-15','3-7','31:30']),{'fieldGoalsMade':8,'fieldGoalsAttempted':15,'threes':3,'threePointersAttempted':7,'minutes':31.5})
    def test_invalid_pair(self):
        for pair in ['9-8','--','x-y','-1-2']:
            with self.assertRaises(ValueError):r.parse_stats(['FG'],[pair])
if __name__=='__main__':unittest.main()

class InjuryTests(unittest.TestCase):
    def test_missing_id_matches_name_and_team(self):
        from injury_sources import espn_index
        payload={'injuries':[{'id':'1','injuries':[{'athlete':{'displayName':'José Test'},'status':'Out'}]}]}
        matched,unmatched=espn_index(payload,[({'teamId':'1'},{'athletes':[{'id':'42','displayName':'Jose Test'}]})])
        self.assertEqual(matched['42']['status'],'Out');self.assertEqual(unmatched,[])
    def test_ambiguous_name_stays_unmatched(self):
        from injury_sources import espn_index
        payload={'injuries':[{'id':'1','injuries':[{'athlete':{'displayName':'Test'},'status':'Out'}]}]}
        matched,unmatched=espn_index(payload,[])
        self.assertEqual(matched,{});self.assertEqual(len(unmatched),1)
    def test_url_id_without_athlete_id(self):
        from injury_sources import espn_index
        matched,_=espn_index({'injuries':[{'injuries':[{'athlete':{'links':[{'href':'https://espn.com/nba/player/_/id/42/test'}]},'status':'Out'}]}]},[])
        self.assertIn('42',matched)
