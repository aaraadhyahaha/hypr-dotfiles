function cfgsave
    set msg "$argv"
    test -z "$msg"; and set msg "update config"
    git -C ~/.config add -A
    git -C ~/.config commit -m "$msg"
    git -C ~/.config push
end
