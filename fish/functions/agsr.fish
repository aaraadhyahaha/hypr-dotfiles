function agsr
    ags quit 2>/dev/null
    sleep 0.3
    cd ~/.config/ags
    setsid ags run >/dev/null 2>&1 &
    cd -
end
