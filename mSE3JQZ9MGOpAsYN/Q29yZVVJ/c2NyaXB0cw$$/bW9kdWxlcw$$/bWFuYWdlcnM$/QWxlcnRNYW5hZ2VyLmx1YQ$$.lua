LJ�	   �4  7% >2  2  2  4  7%   $>4 7  >   Ta�4 74    > = 4  7%	 4
 7	 >$>'  ' I�4
 6	 >

 4
  7

% 4
 7 >$>

 4 
 T
�T�K�4 7 >4 7>  T�4  7% >2  4 :4 77	
 >4 7	 >T�4  7% >'  '	 I�4 776
7>K�4 7 	 >4  7% 4	
 7		
 >	$	>H T*�4 74    > = 4  7%	 4
 7	 >$>'  ' I�4
 6	77>
:
K�4 7  >4  7% 4
 7	 >$>H G  executeFunction'getFeatureAlertsForNonHomeCategory generated feature alerts : 
alert=Monthly report is not enabled and hence is not generatedremovealertsinsert
tableMONTHLY_REPORTid%Monthly report will be generated!checkIfNeedToGenerateACAlertmonthlyReportManager%sortAlertsBySeenCountAndPriorityTOTAL_ITEMSsortedAlerts : executeHomeFunctionencode	jsonalertPriorityWise : getFeatureSeenUnseenAlertsgetAlertsPriorityWise	homecategoryGeneralObjecthelperscurrent category : +generate featureAlerts process startedetwLoggingstatusManager� 	  +)     T�4  74 >  '   ' I�4 76 7>4  T�4 76 7>4  T�4 7	6 74
 >4 76 74 >K�) H  updateAlertActionTakenCountDEFAULT_SEEN_COUNTupdateAlertCountDEFAULT_ACTION_TAKEN_COUNTgetAlertActionTakenCountSEEN_ITEMS_COUNTidgetAlertSeenCounthelpersFEATURE_ALERTSdecode	json�   s4  7% >4 74   > = 2  4  7>'  ' I/�4	 4
	  >
 =	 D&�67
 T"�67
 T� 7 >  T�4  7)   4 7 > =4  7% 4 7 >$>4 7  >BN�K�4 74  > = 4  7>'  '	 I� 76
7
>  T�4 7  >K�2  4  7>  T	�) :T�) ::4  7%	 4
 7

 >
$	
	>H generated critical alertsalertsshow_promotional_alertsisSubscriptionExpiredCriticalValueAlertsManagergetAllCriticalValueAlertsinsert
tableencode	jsoncustomAlert "generateContextDataForAlertIDcontextDataManager
Alertexecuteidgetmetatable
pairsnewCriticalAlertManagergetAllCriticalAlertsgetAlertsPriorityWisehelpers#criticalAlerts process startedetwLoggingstatusManager� 
  F4  7% 4 7  >$>4  7> 77 >  T)�7	 T	�7
7 T�4  7% >G  2  7 :7 ::4  7% 4 7	 >$>4  7% 4 7	 >$>4 7  >4  7% 4 7 >$>H Modified Alert List : insert
tablecurrent list of alerts : Modified Alert : 
alertseencountpriority^Dont show the safe_connect alert when it is home category and the alertID is safe_connectinstalledcontext_datasafe_connectidexecutenewFeatureAlertManagerencode	jsonCurrent Alert : etwLoggingstatusManagert   4   7> 7  >  T�4 7  >H insert
tableexecutenewFeatureAlertManager� 
  =' 4  7>4  T�' T�' 4  7%  $>4  4  7%  $>4 77	 > T�4 7
7	 > T�4  7% >2  7 :7	 :	:4 7  >4  7% 4 7	 >$>H encode	jsonNew Alert List : insert
tableseencountpriority/Will add TRUE_KEY_ENROLL to the alert listgetAlertActionTakenCountidgetAlertSeenCounthelpersUpdated Seen count : SEEN_ITEMS_COUNTbaseValue : etwLoggingSUBSCRIPTION_TYPE_TRIALgetSubscriptionTpyestatusManager�   Y4  7% >)    T�4 74 > 2  '  ' I>�674	 	 T�4  7%	 >4	 6	
 > 4  7%	
 4
 7

 >
$	
	>T%�4 76	7		>4	 	 T	�4	 7		6
7

>	4
 	
 T	�4	 7		6
7

  >	 	 T
�2	  6
7

:
	6
7

:
	:	4
 7

 	 >
K�4  7% 4 7 >$>H 0seenUnseenAlertsList for the home category insert
tableseencountprioritycategorybelongsToCategoryDEFAULT_ACTION_TAKEN_COUNTgetAlertActionTakenCountSEEN_ITEMS_COUNTgetAlertSeenCounthelpersencodeComplete Alert List : #validateHomeCategoryCaseForMTKValidating true key alertTRUE_KEY_ENROLLidFEATURE_ALERTSdecode	json#Get_feature_Seen_Unseen_AlertsetwLoggingstatusManager� 
     T�4  74 >  2  '   ' I�2  6 7:6 7:4 7 	 >K�H insert
tableidpriorityCRITICAL_ALERTSdecode	json� 
     T�4  74 >  2  '   ' I�2  6 7:6 7:4 7 	 >K�H insert
tableidpriorityCRITICAL_VALUE_ALERTSdecode	json�   $  T�4  74 > 2  '  ' I�4 767	  >  T�2  67:67:'  :4	 7
	 
 >K�H insert
tableseencountidprioritycategorybelongsToCategoryhelpersFEATURE_ALERTSdecode	json�   3   1 1 1 1 5 1 5 1 5	 1
 5 1 5 1 5 1 5 4 : : : : 4	 :	 0  �H  getCriticalAlertsgetFeatureAlertsresetActedAlerts'getFeatureAlertsForNonHomeCategory getAllCriticalValueAlerts getAllCriticalAlerts getFeatureSeenUnseenAlerts #validateHomeCategoryCaseForMTK executeFunction executeHomeFunction     _version
0.0.1 
--6C48E736E2926A65EE32DEA0519BF78523819428639AAC7BAFB96719B368767B23D3DD981CBD47088D3CC66D21EAD4936B7EE7AF6D2F67165B2942432FE985D2++