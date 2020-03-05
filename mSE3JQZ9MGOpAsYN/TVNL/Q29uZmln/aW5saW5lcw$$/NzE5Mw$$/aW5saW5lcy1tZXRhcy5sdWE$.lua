function runInlines(sc)
  local fr=sc:Fired()
  function Fire(rule)
    sc:Fire(rule)
    fr[rule]=true
  end
  if fr["__INLINE_HEADER_0"] and fr["__INLINE_BODY_0"]
  then
    Fire("__INLINE_0")
  end
  if fr["__INLINE_HEADER_1"] and fr["__INLINE_BODY_1"]
  then
    Fire("__INLINE_1")
  end
  if fr["__INLINE_HEADER_2"] and fr["__INLINE_BODY_2"]
  then
    Fire("__INLINE_2")
  end
  if fr["__INLINE_HEADER_3"] and fr["__INLINE_BODY_3"]
  then
    Fire("__INLINE_3")
  end
  if fr["__INLINE_HEADER_4"] and fr["__INLINE_BODY_4"]
  then
    Fire("__INLINE_4")
  end
  if fr["__INLINE_HEADER_5"] and fr["__INLINE_BODY_5"]
  then
    Fire("__INLINE_5")
  end
  if fr["__INLINE_HEADER_6"] and fr["__INLINE_BODY_6"]
  then
    Fire("__INLINE_6")
  end
  if fr["__INLINE_HEADER_7"] and fr["__INLINE_BODY_7"]
  then
    Fire("__INLINE_7")
  end
  if fr["__INLINE_HEADER_8"] and fr["__INLINE_BODY_8"]
  then
    Fire("__INLINE_8")
  end
  if fr["__INLINE_0"] or fr["__INLINE_1"] or fr["__INLINE_2"] or fr["__INLINE_3"] or fr["__INLINE_4"] or fr["__INLINE_5"] or fr["__INLINE_6"] or fr["__INLINE_7"] or fr["__INLINE_8"]
  then
    Fire("NAI_INLINES")
  end
end