local obs = obslua
local filter = {
  id = 'utawakui_fisheye_camera',
  type = obs.OBS_SOURCE_TYPE_FILTER,
  output_flags = obs.OBS_SOURCE_VIDEO,
}

local effects = { 'Zoom', 'Glitch', 'Grain' }
local durations = { 0.64, 0.33, 0.72 }

function script_description()
  return 'Utawakui Fisheye Camera. Apply this filter to a full-size OBS scene containing the camera, background, lyrics and peephole frame.'
end

function script_load()
  obs.obs_register_source(filter)
end

function filter.get_name()
  return 'Utawakui Fisheye Camera'
end

function filter.get_defaults(settings)
  obs.obs_data_set_default_int(settings, 'intensity', 75)
  obs.obs_data_set_default_int(settings, 'mode', 0)
  obs.obs_data_set_default_bool(settings, 'automatic', true)
  obs.obs_data_set_default_int(settings, 'camera_control_version', 1)
end

function filter.get_properties()
  local properties = obs.obs_properties_create()
  obs.obs_properties_add_int_slider(properties, 'intensity', 'Intensity (%)', 0, 100, 5)
  local modes = obs.obs_properties_add_list(properties, 'mode', 'Effect', obs.OBS_COMBO_TYPE_LIST, obs.OBS_COMBO_FORMAT_INT)
  obs.obs_property_list_add_int(modes, 'Live', 0)
  obs.obs_properties_add_bool(properties, 'automatic', 'Automatic bursts')
  for index, name in ipairs(effects) do
    obs.obs_property_list_add_int(modes, name, index)
  end
  return properties
end

local function between_effects()
  return 2.4 + math.random() * 3.1
end

function filter.update(data, settings)
  data.intensity = math.max(0, math.min(100, obs.obs_data_get_int(settings, 'intensity'))) / 100
  local mode = math.max(0, math.min(#effects, obs.obs_data_get_int(settings, 'mode')))
  local automatic = obs.obs_data_get_bool(settings, 'automatic')
  if data.mode ~= mode or data.automatic ~= automatic then
    data.until_next = between_effects()
    data.elapsed = 0
    data.effect_index = 0
    data.manual = false
  end
  data.mode = mode
  data.automatic = automatic
  local cue = obs.obs_data_get_string(settings, 'camera_cue')
  if data.cue ~= nil and cue ~= '' and data.cue ~= cue and mode == 0 and data.intensity > 0 then
    local index = obs.obs_data_get_int(settings, 'camera_effect')
    if index >= 1 and index <= #effects then
      data.effect_index = index
      data.elapsed = 0
      data.manual = true
    end
  end
  data.cue = cue
end

function filter.create(settings, source)
  local path = script_path() .. 'fisheye-camera.effect'
  obs.obs_enter_graphics()
  local effect = obs.gs_effect_create_from_file(path, nil)
  obs.obs_leave_graphics()
  if not effect then
    obs.script_log(obs.LOG_ERROR, 'Could not compile ' .. path)
    return nil
  end
  local data = { source = source, effect = effect, width = 0, height = 0 }
  data.mode_param = obs.gs_effect_get_param_by_name(effect, 'mode')
  data.strength_param = obs.gs_effect_get_param_by_name(effect, 'strength')
  data.time_param = obs.gs_effect_get_param_by_name(effect, 'effect_time')
  data.direction_param = obs.gs_effect_get_param_by_name(effect, 'direction')
  filter.update(data, settings)
  return data
end

function filter.destroy(data)
  obs.obs_enter_graphics()
  obs.gs_effect_destroy(data.effect)
  obs.obs_leave_graphics()
end

function filter.get_width(data)
  return data.width
end

function filter.get_height(data)
  return data.height
end

function filter.video_tick(data, seconds)
  data.elapsed = data.elapsed + seconds
  if data.mode ~= 0 then return end
  if data.effect_index ~= 0 then
    if data.elapsed < durations[data.effect_index] then return end
    if not data.manual then data.last_effect = data.effect_index end
    data.effect_index = 0
    data.manual = false
    data.until_next = between_effects()
  end
  if not data.automatic then return end
  data.until_next = data.until_next - seconds
  if data.until_next > 0 then return end
  local choice = math.random(#effects)
  if choice == data.last_effect then choice = choice % #effects + 1 end
  data.effect_index = choice
  data.elapsed = 0
end

function filter.video_render(data)
  local target = obs.obs_filter_get_target(data.source)
  if not target then
    obs.obs_source_skip_video_filter(data.source)
    return
  end
  local width = obs.obs_source_get_base_width(target)
  local height = obs.obs_source_get_base_height(target)
  data.width = width
  data.height = height
  local mode = data.mode ~= 0 and data.mode or data.effect_index
  if mode == 0 or data.intensity == 0 or width == 0 or height == 0 then
    obs.obs_source_skip_video_filter(data.source)
    return
  end
  if not obs.obs_source_process_filter_begin(data.source, obs.GS_RGBA, obs.OBS_NO_DIRECT_RENDERING) then return end

  local progress = math.min(1, data.elapsed / durations[mode])
  local amount = data.mode ~= 0 and 1 or math.sin(math.pi * progress)
  local direction = data.mode ~= 0 and 1 or math.cos(math.pi * progress)
  obs.gs_effect_set_int(data.mode_param, mode)
  obs.gs_effect_set_float(data.strength_param, amount * data.intensity)
  obs.gs_effect_set_float(data.time_param, data.elapsed % 120)
  obs.gs_effect_set_float(data.direction_param, direction)
  obs.obs_source_process_filter_end(data.source, data.effect, width, height)
end
