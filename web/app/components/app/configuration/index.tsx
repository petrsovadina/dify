'use client'
import type { FC } from 'react'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useContext } from 'use-context-selector'
import { usePathname } from 'next/navigation'
import produce from 'immer'
import { useBoolean, useGetState } from 'ahooks'
import cn from 'classnames'
import { clone, isEqual } from 'lodash-es'
import { CodeBracketIcon } from '@heroicons/react/20/solid'
import Button from '../../base/button'
import Loading from '../../base/loading'
import useAdvancedPromptConfig from './hooks/use-advanced-prompt-config'
import EditHistoryModal from './config-prompt/conversation-histroy/edit-modal'
import {
  useDebugWithSingleOrMultipleModel,
  useFormattingChangedDispatcher,
} from './debug/hooks'
import type { ModelAndParameter } from './debug/types'
import { APP_SIDEBAR_SHOULD_COLLAPSE } from './debug/types'
import PublishWithMultipleModel from './debug/debug-with-multiple-model/publish-with-multiple-model'
import AssistantTypePicker from './config/assistant-type-picker'
import type {
  AnnotationReplyConfig,
  DatasetConfigs,
  Inputs,
  ModelConfig,
  ModerationConfig,
  MoreLikeThisConfig,
  PromptConfig,
  PromptVariable,
} from '@/models/debug'
import type { ExternalDataTool } from '@/models/common'
import type { DataSet } from '@/models/datasets'
import type { ModelConfig as BackendModelConfig, VisionSettings } from '@/types/app'
import ConfigContext from '@/context/debug-configuration'
import Config from '@/app/components/app/configuration/config'
import Debug from '@/app/components/app/configuration/debug'
import Confirm from '@/app/components/base/confirm'
import { ModelFeatureEnum } from '@/app/components/header/account-setting/model-provider-page/declarations'
import { ToastContext } from '@/app/components/base/toast'
import { fetchAppDetail, updateAppModelConfig } from '@/service/apps'
import { promptVariablesToUserInputsForm, userInputsFormToPromptVariables } from '@/utils/model-config'
import { fetchDatasets } from '@/service/datasets'
import { useProviderContext } from '@/context/provider-context'
import { AgentStrategy, AppType, ModelModeType, RETRIEVE_TYPE, Resolution, TransferMethod } from '@/types/app'
import { PromptMode } from '@/models/debug'
import { ANNOTATION_DEFAULT, DEFAULT_AGENT_SETTING, DEFAULT_CHAT_PROMPT_CONFIG, DEFAULT_COMPLETION_PROMPT_CONFIG, supportFunctionCallModels } from '@/config'
import SelectDataSet from '@/app/components/app/configuration/dataset-config/select-dataset'
import { useModalContext } from '@/context/modal-context'
import useBreakpoints, { MediaType } from '@/hooks/use-breakpoints'
import Drawer from '@/app/components/base/drawer'
import ModelParameterModal from '@/app/components/header/account-setting/model-provider-page/model-parameter-modal'
import type { FormValue } from '@/app/components/header/account-setting/model-provider-page/declarations'
import { useTextGenerationCurrentProviderAndModelAndModelList } from '@/app/components/header/account-setting/model-provider-page/hooks'
import { fetchCollectionList } from '@/service/tools'
import { type Collection } from '@/app/components/tools/types'
import { useEventEmitterContextContext } from '@/context/event-emitter'

type PublichConfig = {
  modelConfig: ModelConfig
  completionParams: FormValue
}

const Configuration: FC = () => {
  const { t } = useTranslation()
  const { notify } = useContext(ToastContext)
  const [formattingChanged, setFormattingChanged] = useState(false)
  const { setShowAccountSettingModal } = useModalContext()
  const [hasFetchedDetail, setHasFetchedDetail] = useState(false)
  const isLoading = !hasFetchedDetail
  const pathname = usePathname()
  const matched = pathname.match(/\/app\/([^/]+)/)
  const appId = (matched?.length && matched[1]) ? matched[1] : ''
  const [mode, setMode] = useState('')
  const [publishedConfig, setPublishedConfig] = useState<PublichConfig | null>(null)

  const [conversationId, setConversationId] = useState<string | null>('')

  const media = useBreakpoints()
  const isMobile = media === MediaType.mobile
  const [isShowDebugPanel, { setTrue: showDebugPanel, setFalse: hideDebugPanel }] = useBoolean(false)

  const [introduction, setIntroduction] = useState<string>('')
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([])
  const [controlClearChatMessage, setControlClearChatMessage] = useState(0)
  const [prevPromptConfig, setPrevPromptConfig] = useState<PromptConfig>({
    prompt_template: '',
    prompt_variables: [],
  })
  const [moreLikeThisConfig, setMoreLikeThisConfig] = useState<MoreLikeThisConfig>({
    enabled: false,
  })
  const [suggestedQuestionsAfterAnswerConfig, setSuggestedQuestionsAfterAnswerConfig] = useState<MoreLikeThisConfig>({
    enabled: false,
  })
  const [speechToTextConfig, setSpeechToTextConfig] = useState<MoreLikeThisConfig>({
    enabled: false,
  })
  const [textToSpeechConfig, setTextToSpeechConfig] = useState<MoreLikeThisConfig>({
    enabled: false,
  })
  const [citationConfig, setCitationConfig] = useState<MoreLikeThisConfig>({
    enabled: false,
  })
  const [annotationConfig, doSetAnnotationConfig] = useState<AnnotationReplyConfig>({
    id: '',
    enabled: false,
    score_threshold: ANNOTATION_DEFAULT.score_threshold,
    embedding_model: {
      embedding_provider_name: '',
      embedding_model_name: '',
    },
  })
  const formattingChangedDispatcher = useFormattingChangedDispatcher()
  const setAnnotationConfig = (config: AnnotationReplyConfig, notSetFormatChanged?: boolean) => {
    doSetAnnotationConfig(config)
    if (!notSetFormatChanged)
      formattingChangedDispatcher()
  }

  const [moderationConfig, setModerationConfig] = useState<ModerationConfig>({
    enabled: false,
  })
  const [externalDataToolsConfig, setExternalDataToolsConfig] = useState<ExternalDataTool[]>([])
  const [inputs, setInputs] = useState<Inputs>({})
  const [query, setQuery] = useState('')
  const [completionParams, doSetCompletionParams] = useState<FormValue>({})
  const [tempStop, setTempStop, getTempStop] = useGetState<string[]>([])
  const setCompletionParams = (value: FormValue) => {
    const params = { ...value }

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    if ((!params.stop || params.stop.length === 0) && (modeModeTypeRef.current === ModelModeType.completion)) {
      params.stop = getTempStop()
      setTempStop([])
    }
    doSetCompletionParams(params)
  }

  const [modelConfig, doSetModelConfig] = useState<ModelConfig>({
    provider: 'openai',
    model_id: 'gpt-3.5-turbo',
    mode: ModelModeType.unset,
    configs: {
      prompt_template: '',
      prompt_variables: [] as PromptVariable[],
    },
    opening_statement: '',
    more_like_this: null,
    suggested_questions_after_answer: null,
    speech_to_text: null,
    text_to_speech: null,
    retriever_resource: null,
    sensitive_word_avoidance: null,
    dataSets: [],
    agentConfig: DEFAULT_AGENT_SETTING,
  })
  const isChatApp = mode === AppType.chat
  const isAgent = modelConfig.agentConfig?.enabled
  const setIsAgent = (value: boolean) => {
    const newModelConfig = produce(modelConfig, (draft: ModelConfig) => {
      draft.agentConfig.enabled = value
    })
    doSetModelConfig(newModelConfig)
  }
  const isOpenAI = modelConfig.provider === 'openai'
  const isFunctionCall = (isOpenAI && modelConfig.mode === ModelModeType.chat) || supportFunctionCallModels.includes(modelConfig.model_id)
  const [collectionList, setCollectionList] = useState<Collection[]>([])
  useEffect(() => {

  }, [])
  const [datasetConfigs, setDatasetConfigs] = useState<DatasetConfigs>({
    retrieval_model: RETRIEVE_TYPE.oneWay,
    reranking_model: {
      reranking_provider_name: '',
      reranking_model_name: '',
    },
    top_k: 2,
    score_threshold_enabled: false,
    score_threshold: 0.7,
    datasets: {
      datasets: [],
    },
  })

  const setModelConfig = (newModelConfig: ModelConfig) => {
    doSetModelConfig(newModelConfig)
  }

  const modelModeType = modelConfig.mode
  const modeModeTypeRef = useRef(modelModeType)
  useEffect(() => {
    modeModeTypeRef.current = modelModeType
  }, [modelModeType])

  const [dataSets, setDataSets] = useState<DataSet[]>([])
  const contextVar = modelConfig.configs.prompt_variables.find((item: any) => item.is_context_var)?.key
  const hasSetContextVar = !!contextVar
  const [isShowSelectDataSet, { setTrue: showSelectDataSet, setFalse: hideSelectDataSet }] = useBoolean(false)
  const selectedIds = dataSets.map(item => item.id)
  const handleSelect = (data: DataSet[]) => {
    if (isEqual(data.map(item => item.id), dataSets.map(item => item.id))) {
      hideSelectDataSet()
      return
    }

    formattingChangedDispatcher()
    if (data.find(item => !item.name)) { // has not loaded selected dataset
      const newSelected = produce(data, (draft: any) => {
        data.forEach((item, index) => {
          if (!item.name) { // not fetched database
            const newItem = dataSets.find(i => i.id === item.id)
            if (newItem)
              draft[index] = newItem
          }
        })
      })
      setDataSets(newSelected)
    }
    else {
      setDataSets(data)
    }
    hideSelectDataSet()
  }

  const [isShowHistoryModal, { setTrue: showHistoryModal, setFalse: hideHistoryModal }] = useBoolean(false)

  const syncToPublishedConfig = (_publishedConfig: PublichConfig) => {
    const modelConfig = _publishedConfig.modelConfig
    setModelConfig(_publishedConfig.modelConfig)
    setCompletionParams(_publishedConfig.completionParams)
    setDataSets(modelConfig.dataSets || [])
    // feature
    setIntroduction(modelConfig.opening_statement!)
    setMoreLikeThisConfig(modelConfig.more_like_this || {
      enabled: false,
    })
    setSuggestedQuestionsAfterAnswerConfig(modelConfig.suggested_questions_after_answer || {
      enabled: false,
    })
    setSpeechToTextConfig(modelConfig.speech_to_text || {
      enabled: false,
    })
    setTextToSpeechConfig(modelConfig.text_to_speech || {
      enabled: false,
    })
    setCitationConfig(modelConfig.retriever_resource || {
      enabled: false,
    })
  }

  const { hasSettedApiKey } = useProviderContext()
  const {
    currentModel: currModel,
    textGenerationModelList,
  } = useTextGenerationCurrentProviderAndModelAndModelList(
    {
      provider: modelConfig.provider,
      model: modelConfig.model_id,
    },
  )

  // Fill old app data missing model mode.
  useEffect(() => {
    if (hasFetchedDetail && !modelModeType) {
      const mode = currModel?.model_properties.mode as (ModelModeType | undefined)
      if (mode) {
        const newModelConfig = produce(modelConfig, (draft: ModelConfig) => {
          draft.mode = mode
        })
        setModelConfig(newModelConfig)
      }
    }
  }, [textGenerationModelList, hasFetchedDetail, modelModeType, currModel, modelConfig])

  const [promptMode, doSetPromptMode] = useState(PromptMode.simple)
  const isAdvancedMode = promptMode === PromptMode.advanced
  const [canReturnToSimpleMode, setCanReturnToSimpleMode] = useState(true)
  const setPromptMode = async (mode: PromptMode) => {
    if (mode === PromptMode.advanced) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      await migrateToDefaultPrompt()
      setCanReturnToSimpleMode(true)
    }

    doSetPromptMode(mode)
  }
  const [visionConfig, doSetVisionConfig] = useState({
    enabled: false,
    number_limits: 2,
    detail: Resolution.low,
    transfer_methods: [TransferMethod.local_file],
  })

  const handleSetVisionConfig = (config: VisionSettings, notNoticeFormattingChanged?: boolean) => {
    doSetVisionConfig({
      enabled: config.enabled || false,
      number_limits: config.number_limits || 2,
      detail: config.detail || Resolution.low,
      transfer_methods: config.transfer_methods || [TransferMethod.local_file],
    })
    if (!notNoticeFormattingChanged)
      formattingChangedDispatcher()
  }

  const {
    chatPromptConfig,
    setChatPromptConfig,
    completionPromptConfig,
    setCompletionPromptConfig,
    currentAdvancedPrompt,
    setCurrentAdvancedPrompt,
    hasSetBlockStatus,
    setConversationHistoriesRole,
    migrateToDefaultPrompt,
  } = useAdvancedPromptConfig({
    appMode: mode,
    modelName: modelConfig.model_id,
    promptMode,
    modelModeType,
    prePrompt: modelConfig.configs.prompt_template,
    hasSetDataSet: dataSets.length > 0,
    onUserChangedPrompt: () => {
      setCanReturnToSimpleMode(false)
    },
    completionParams,
    setCompletionParams,
    setStop: setTempStop,
  })
  const setModel = async ({
    modelId,
    provider,
    mode: modeMode,
    features,
  }: { modelId: string; provider: string; mode: string; features: string[] }) => {
    if (isAdvancedMode) {
      const appMode = mode

      if (modeMode === ModelModeType.completion) {
        if (appMode === AppType.chat) {
          if (!completionPromptConfig.prompt.text || !completionPromptConfig.conversation_histories_role.assistant_prefix || !completionPromptConfig.conversation_histories_role.user_prefix)
            await migrateToDefaultPrompt(true, ModelModeType.completion)
        }
        else {
          if (!completionPromptConfig.prompt.text)
            await migrateToDefaultPrompt(true, ModelModeType.completion)
        }
      }
      if (modeMode === ModelModeType.chat) {
        if (chatPromptConfig.prompt.length === 0)
          await migrateToDefaultPrompt(true, ModelModeType.chat)
      }
    }
    const newModelConfig = produce(modelConfig, (draft: ModelConfig) => {
      draft.provider = provider
      draft.model_id = modelId
      draft.mode = modeMode as ModelModeType
    })

    setModelConfig(newModelConfig)
    const supportVision = features && features.includes(ModelFeatureEnum.vision)

    handleSetVisionConfig({
      ...visionConfig,
      enabled: supportVision,
    }, true)
    setCompletionParams({})
  }

  const isShowVisionConfig = !!currModel?.features?.includes(ModelFeatureEnum.vision)

  useEffect(() => {
    (async () => {
      const collectionList = await fetchCollectionList() as Collection[]
      setCollectionList(collectionList)
      fetchAppDetail({ url: '/apps', id: appId }).then(async (res: any) => {
        setMode(res.mode)
        const modelConfig = res.model_config
        const promptMode = modelConfig.prompt_type === PromptMode.advanced ? PromptMode.advanced : PromptMode.simple
        doSetPromptMode(promptMode)
        if (promptMode === PromptMode.advanced) {
          setChatPromptConfig(modelConfig.chat_prompt_config || clone(DEFAULT_CHAT_PROMPT_CONFIG) as any)
          setCompletionPromptConfig(modelConfig.completion_prompt_config || clone(DEFAULT_COMPLETION_PROMPT_CONFIG) as any)
          setCanReturnToSimpleMode(false)
        }

        const model = res.model_config.model

        let datasets: any = null
        // old dataset struct
        if (modelConfig.agent_mode?.tools?.find(({ dataset }: any) => dataset?.enabled))
          datasets = modelConfig.agent_mode?.tools.filter(({ dataset }: any) => dataset?.enabled)
        // new dataset struct
        else if (modelConfig.dataset_configs.datasets?.datasets?.length > 0)
          datasets = modelConfig.dataset_configs?.datasets?.datasets

        if (dataSets && datasets?.length && datasets?.length > 0) {
          const { data: dataSetsWithDetail } = await fetchDatasets({ url: '/datasets', params: { page: 1, ids: datasets.map(({ dataset }: any) => dataset.id) } })
          datasets = dataSetsWithDetail
          setDataSets(datasets)
        }

        setIntroduction(modelConfig.opening_statement)
        setSuggestedQuestions(modelConfig.suggested_questions || [])
        if (modelConfig.more_like_this)
          setMoreLikeThisConfig(modelConfig.more_like_this)

        if (modelConfig.suggested_questions_after_answer)
          setSuggestedQuestionsAfterAnswerConfig(modelConfig.suggested_questions_after_answer)

        if (modelConfig.speech_to_text)
          setSpeechToTextConfig(modelConfig.speech_to_text)

        if (modelConfig.text_to_speech)
          setTextToSpeechConfig(modelConfig.text_to_speech)

        if (modelConfig.retriever_resource)
          setCitationConfig(modelConfig.retriever_resource)

        if (modelConfig.annotation_reply)
          setAnnotationConfig(modelConfig.annotation_reply, true)

        if (modelConfig.sensitive_word_avoidance)
          setModerationConfig(modelConfig.sensitive_word_avoidance)

        if (modelConfig.external_data_tools)
          setExternalDataToolsConfig(modelConfig.external_data_tools)

        const config = {
          modelConfig: {
            provider: model.provider,
            model_id: model.name,
            mode: model.mode,
            configs: {
              prompt_template: modelConfig.pre_prompt,
              prompt_variables: userInputsFormToPromptVariables(
                [
                  ...modelConfig.user_input_form,
                  ...(
                    modelConfig.external_data_tools?.length
                      ? modelConfig.external_data_tools.map((item: any) => {
                        return {
                          external_data_tool: {
                            variable: item.variable as string,
                            label: item.label as string,
                            enabled: item.enabled,
                            type: item.type as string,
                            config: item.config,
                            required: true,
                            icon: item.icon,
                            icon_background: item.icon_background,
                          },
                        }
                      })
                      : []
                  ),
                ],
                modelConfig.dataset_query_variable,
              ),
            },
            opening_statement: modelConfig.opening_statement,
            more_like_this: modelConfig.more_like_this,
            suggested_questions_after_answer: modelConfig.suggested_questions_after_answer,
            speech_to_text: modelConfig.speech_to_text,
            text_to_speech: modelConfig.text_to_speech,
            retriever_resource: modelConfig.retriever_resource,
            sensitive_word_avoidance: modelConfig.sensitive_word_avoidance,
            external_data_tools: modelConfig.external_data_tools,
            dataSets: datasets || [],
            // eslint-disable-next-line multiline-ternary
            agentConfig: res.is_agent ? {
              max_iteration: DEFAULT_AGENT_SETTING.max_iteration,
              ...modelConfig.agent_mode,
              // remove dataset
              enabled: true, // modelConfig.agent_mode?.enabled is not correct. old app: the value of app with dataset's is always true
              tools: modelConfig.agent_mode?.tools.filter((tool: any) => {
                return !tool.dataset
              }).map((tool: any) => {
                return {
                  ...tool,
                  isDeleted: res.deleted_tools?.includes(tool.tool_name),
                  notAuthor: collectionList.find(c => tool.provider_id === c.id)?.is_team_authorization === false,
                }
              }),
            } : DEFAULT_AGENT_SETTING,
          },
          completionParams: model.completion_params,
        }

        if (modelConfig.file_upload)
          handleSetVisionConfig(modelConfig.file_upload.image, true)

        syncToPublishedConfig(config)
        setPublishedConfig(config)
        setDatasetConfigs({
          retrieval_model: RETRIEVE_TYPE.oneWay,
          ...modelConfig.dataset_configs,
        })
        setHasFetchedDetail(true)
      })
    })()
  }, [appId])

  const promptEmpty = (() => {
    if (mode === AppType.chat)
      return false

    if (isAdvancedMode) {
      if (modelModeType === ModelModeType.chat)
        return chatPromptConfig.prompt.every(({ text }: any) => !text)

      else
        return !completionPromptConfig.prompt.text
    }

    else { return !modelConfig.configs.prompt_template }
  })()
  const cannotPublish = (() => {
    if (mode === AppType.chat) {
      if (!isAdvancedMode)
        return false

      if (modelModeType === ModelModeType.completion) {
        if (!hasSetBlockStatus.history || !hasSetBlockStatus.query)
          return true

        return false
      }

      return false
    }
    else { return promptEmpty }
  })()
  const contextVarEmpty = mode === AppType.completion && dataSets.length > 0 && !hasSetContextVar
  const handlePublish = async (isSilence?: boolean, modelAndParameter?: ModelAndParameter) => {
    const modelId = modelAndParameter?.model || modelConfig.model_id
    const promptTemplate = modelConfig.configs.prompt_template
    const promptVariables = modelConfig.configs.prompt_variables

    if (promptEmpty) {
      notify({ type: 'error', message: t('appDebug.otherError.promptNoBeEmpty'), duration: 3000 })
      return
    }
    if (isAdvancedMode && mode === AppType.chat) {
      if (modelModeType === ModelModeType.completion) {
        if (!hasSetBlockStatus.history) {
          notify({ type: 'error', message: t('appDebug.otherError.historyNoBeEmpty'), duration: 3000 })
          return
        }
        if (!hasSetBlockStatus.query) {
          notify({ type: 'error', message: t('appDebug.otherError.queryNoBeEmpty'), duration: 3000 })
          return
        }
      }
    }
    if (contextVarEmpty) {
      notify({ type: 'error', message: t('appDebug.feature.dataSet.queryVariable.contextVarNotEmpty'), duration: 3000 })
      return
    }
    const postDatasets = dataSets.map(({ id }) => ({
      dataset: {
        enabled: true,
        id,
      },
    }))

    // new model config data struct
    const data: BackendModelConfig = {
      // Simple Mode prompt
      pre_prompt: !isAdvancedMode ? promptTemplate : '',
      prompt_type: promptMode,
      chat_prompt_config: {},
      completion_prompt_config: {},
      user_input_form: promptVariablesToUserInputsForm(promptVariables),
      dataset_query_variable: contextVar || '',
      opening_statement: introduction || '',
      suggested_questions: suggestedQuestions || [],
      more_like_this: moreLikeThisConfig,
      suggested_questions_after_answer: suggestedQuestionsAfterAnswerConfig,
      speech_to_text: speechToTextConfig,
      text_to_speech: textToSpeechConfig,
      retriever_resource: citationConfig,
      sensitive_word_avoidance: moderationConfig,
      agent_mode: {
        ...modelConfig.agentConfig,
        strategy: isFunctionCall ? AgentStrategy.functionCall : AgentStrategy.react,
      },
      model: {
        provider: modelAndParameter?.provider || modelConfig.provider,
        name: modelId,
        mode: modelConfig.mode,
        completion_params: modelAndParameter?.parameters || completionParams as any,
      },
      dataset_configs: {
        ...datasetConfigs,
        datasets: {
          datasets: [...postDatasets],
        } as any,
      },
      file_upload: {
        image: visionConfig,
      },
    }

    if (isAdvancedMode) {
      data.chat_prompt_config = chatPromptConfig
      data.completion_prompt_config = completionPromptConfig
    }

    await updateAppModelConfig({ url: `/apps/${appId}/model-config`, body: data })
    const newModelConfig = produce(modelConfig, (draft: any) => {
      draft.opening_statement = introduction
      draft.more_like_this = moreLikeThisConfig
      draft.suggested_questions_after_answer = suggestedQuestionsAfterAnswerConfig
      draft.speech_to_text = speechToTextConfig
      draft.text_to_speech = textToSpeechConfig
      draft.retriever_resource = citationConfig
      draft.dataSets = dataSets
    })
    setPublishedConfig({
      modelConfig: newModelConfig,
      completionParams,
    })
    if (!isSilence)
      notify({ type: 'success', message: t('common.api.success'), duration: 3000 })

    setCanReturnToSimpleMode(false)
    return true
  }

  const [showConfirm, setShowConfirm] = useState(false)
  const resetAppConfig = () => {
    syncToPublishedConfig(publishedConfig!)
    setShowConfirm(false)
  }

  const [showUseGPT4Confirm, setShowUseGPT4Confirm] = useState(false)

  const { eventEmitter } = useEventEmitterContextContext()
  const {
    debugWithMultipleModel,
    multipleModelConfigs,
    handleMultipleModelConfigsChange,
  } = useDebugWithSingleOrMultipleModel(appId)

  const handleDebugWithMultipleModelChange = () => {
    handleMultipleModelConfigsChange(
      true,
      [
        { id: `${Date.now()}`, model: modelConfig.model_id, provider: modelConfig.provider, parameters: completionParams },
        { id: `${Date.now()}-no-repeat`, model: '', provider: '', parameters: {} },
      ],
    )
    eventEmitter?.emit({
      type: APP_SIDEBAR_SHOULD_COLLAPSE,
    } as any)
  }

  if (isLoading) {
    return <div className='flex h-full items-center justify-center'>
      <Loading type='area' />
    </div>
  }

  return (
    <ConfigContext.Provider value={{
      appId,
      hasSetAPIKEY: hasSettedApiKey,
      isTrailFinished: false,
      mode,
      modelModeType,
      promptMode,
      isAdvancedMode,
      isAgent,
      isOpenAI,
      isFunctionCall,
      collectionList,
      setPromptMode,
      canReturnToSimpleMode,
      setCanReturnToSimpleMode,
      chatPromptConfig,
      completionPromptConfig,
      currentAdvancedPrompt,
      setCurrentAdvancedPrompt,
      conversationHistoriesRole: completionPromptConfig.conversation_histories_role,
      showHistoryModal,
      setConversationHistoriesRole,
      hasSetBlockStatus,
      conversationId,
      introduction,
      setIntroduction,
      suggestedQuestions,
      setSuggestedQuestions,
      setConversationId,
      controlClearChatMessage,
      setControlClearChatMessage,
      prevPromptConfig,
      setPrevPromptConfig,
      moreLikeThisConfig,
      setMoreLikeThisConfig,
      suggestedQuestionsAfterAnswerConfig,
      setSuggestedQuestionsAfterAnswerConfig,
      speechToTextConfig,
      setSpeechToTextConfig,
      textToSpeechConfig,
      setTextToSpeechConfig,
      citationConfig,
      setCitationConfig,
      annotationConfig,
      setAnnotationConfig,
      moderationConfig,
      setModerationConfig,
      externalDataToolsConfig,
      setExternalDataToolsConfig,
      formattingChanged,
      setFormattingChanged,
      inputs,
      setInputs,
      query,
      setQuery,
      completionParams,
      setCompletionParams,
      modelConfig,
      setModelConfig,
      showSelectDataSet,
      dataSets,
      setDataSets,
      datasetConfigs,
      setDatasetConfigs,
      hasSetContextVar,
      isShowVisionConfig,
      visionConfig,
      setVisionConfig: handleSetVisionConfig,
    }}
    >
      <>
        <div className="flex flex-col h-full">
          <div className='flex grow h-[200px]'>
            <div className={`w-full sm:w-1/2 shrink-0 flex flex-col h-full ${debugWithMultipleModel && 'max-w-[560px]'}`}>
              {/* Header Left */}
              <div className='flex justify-between items-center px-6 h-14'>
                <div className='flex items-center'>
                  <div className='leading-6 text-base font-semibold text-gray-900'>{t('appDebug.orchestrate')}</div>
                  <div className='flex items-center h-[14px] space-x-1 text-xs'>
                    {isAdvancedMode && (
                      <div className='ml-1 flex items-center h-5 px-1.5 border border-gray-100 rounded-md text-[11px] font-medium text-gray-500 uppercase'>{t('appDebug.promptMode.advanced')}</div>
                    )}
                  </div>
                </div>
                {isChatApp && (
                  <AssistantTypePicker
                    value={isAgent ? 'agent' : 'assistant'}
                    disabled={isAdvancedMode && !canReturnToSimpleMode}
                    onChange={(value: string) => {
                      setIsAgent(value === 'agent')
                      if (value === 'agent')
                        setPromptMode(PromptMode.simple)
                    }}
                    isFunctionCall={isFunctionCall}
                    isChatModel={modelConfig.mode === ModelModeType.chat}
                    agentConfig={modelConfig.agentConfig}
                    onAgentSettingChange={(config) => {
                      const nextConfig = produce(modelConfig, (draft: ModelConfig) => {
                        draft.agentConfig = config
                      })
                      setModelConfig(nextConfig)
                    }}
                  />
                )}
              </div>
              <Config />
            </div>
            {!isMobile && <div className="grow relative w-1/2  h-full overflow-y-auto  flex flex-col " style={{ borderColor: 'rgba(0, 0, 0, 0.02)' }}>
              {/* Header Right */}
              <div className='flex justify-end items-center flex-wrap px-6 h-14 space-x-2'>
                {/* Model and Parameters */}
                {
                  !debugWithMultipleModel && (
                    <>
                      <ModelParameterModal
                        isAdvancedMode={isAdvancedMode}
                        mode={mode}
                        provider={modelConfig.provider}
                        completionParams={completionParams}
                        modelId={modelConfig.model_id}
                        setModel={setModel as any}
                        onCompletionParamsChange={(newParams: FormValue) => {
                          setCompletionParams(newParams)
                        }}
                        debugWithMultipleModel={debugWithMultipleModel}
                        onDebugWithMultipleModelChange={handleDebugWithMultipleModelChange}
                      />
                      <div className='w-[1px] h-[14px] bg-gray-200'></div>
                    </>
                  )
                }
                <Button onClick={() => setShowConfirm(true)} className='shrink-0 mr-2 w-[70px] !h-8 !text-[13px] font-medium'>{t('appDebug.operation.resetConfig')}</Button>
                {isMobile && (
                  <Button className='!h-8 !text-[13px] font-medium' onClick={showDebugPanel}>
                    <span className='mr-1'>{t('appDebug.operation.debugConfig')}</span>
                    <CodeBracketIcon className="h-4 w-4 text-gray-500" />
                  </Button>
                )}
                {
                  debugWithMultipleModel
                    ? (
                      <PublishWithMultipleModel
                        multipleModelConfigs={multipleModelConfigs}
                        onSelect={item => handlePublish(false, item)}
                      />
                    )
                    : (
                      <Button
                        type='primary'
                        onClick={() => handlePublish(false)}
                        className={cn(cannotPublish && '!bg-primary-200 !cursor-not-allowed', 'shrink-0 w-[70px] !h-8 !text-[13px] font-medium')}
                      >
                        {t('appDebug.operation.applyConfig')}
                      </Button>
                    )
                }
              </div>
              <div className='flex flex-col grow h-0 rounded-tl-2xl border-t border-l bg-gray-50 '>
                <Debug
                  hasSetAPIKEY={hasSettedApiKey}
                  onSetting={() => setShowAccountSettingModal({ payload: 'provider' })}
                  inputs={inputs}
                  modelParameterParams={{
                    setModel: setModel as any,
                    onCompletionParamsChange: setCompletionParams,
                  }}
                  debugWithMultipleModel={debugWithMultipleModel}
                  multipleModelConfigs={multipleModelConfigs}
                  onMultipleModelConfigsChange={handleMultipleModelConfigsChange}
                />
              </div>
            </div>}
          </div>
        </div>
        {showConfirm && (
          <Confirm
            title={t('appDebug.resetConfig.title')}
            content={t('appDebug.resetConfig.message')}
            isShow={showConfirm}
            onClose={() => setShowConfirm(false)}
            onConfirm={resetAppConfig}
            onCancel={() => setShowConfirm(false)}
          />
        )}
        {showUseGPT4Confirm && (
          <Confirm
            title={t('appDebug.trailUseGPT4Info.title')}
            content={t('appDebug.trailUseGPT4Info.description')}
            isShow={showUseGPT4Confirm}
            onClose={() => setShowUseGPT4Confirm(false)}
            onConfirm={() => {
              setShowAccountSettingModal({ payload: 'provider' })
              setShowUseGPT4Confirm(false)
            }}
            onCancel={() => setShowUseGPT4Confirm(false)}
          />
        )}

        {isShowSelectDataSet && (
          <SelectDataSet
            isShow={isShowSelectDataSet}
            onClose={hideSelectDataSet}
            selectedIds={selectedIds}
            onSelect={handleSelect}
          />
        )}

        {isShowHistoryModal && (
          <EditHistoryModal
            isShow={isShowHistoryModal}
            saveLoading={false}
            onClose={hideHistoryModal}
            data={completionPromptConfig.conversation_histories_role}
            onSave={(data) => {
              setConversationHistoriesRole(data)
              hideHistoryModal()
            }}
          />
        )}
        {isMobile && (
          <Drawer showClose isOpen={isShowDebugPanel} onClose={hideDebugPanel} mask footer={null} panelClassname='!bg-gray-50'>
            <Debug
              hasSetAPIKEY={hasSettedApiKey}
              onSetting={() => setShowAccountSettingModal({ payload: 'provider' })}
              inputs={inputs}
              modelParameterParams={{
                setModel: setModel as any,
                onCompletionParamsChange: setCompletionParams,
              }}
              debugWithMultipleModel={debugWithMultipleModel}
              multipleModelConfigs={multipleModelConfigs}
              onMultipleModelConfigsChange={handleMultipleModelConfigsChange}
            />
          </Drawer>
        )}
      </>
    </ConfigContext.Provider>
  )
}
export default React.memo(Configuration)
