# udpComs

Simple script to send and receive commands between devices. There is no encryption or security so use at your own risk.

## Instructions

### Server

The server receives messages and runs any commands it is configured to.
If using a config file and deafults you can simply run

```node udpcoms```

If you are specifying commands at runtime and port run

```node udpComs -port 6868 -mode server -cmds pad:notepoad,nircmd:/mnt/c/windows/nircmd.exe```

The cmd arguments should be the command name and command/program path seperated by a colon ```cmdName:path``` and multiple commands seperated by commas.

### Client

Send a message with

```node udpcoms -ip 192.169.x.x cmdName optionalArgs```

e.g.
```node udpcoms -ip 192.169.x.x -mode sendnircmd changesysvolume +10000```

### Config

Using a udpcoms.json file to save common setting for server

'''
{
  "spotify": "C:/Users/unpar/AppData/Roaming/Spotify/Spotify.exe",
  "nircmd": "/mnt/c/windows/nircmd.exe",
  "paint": "/mnt/c/windows/system32/mspaint.exe",
  "pad": "pad",
  "port": "6789"
}
'''

### Examples

Control you computer using programs like nircmd
'''
node udpcoms -cmds nircmd:c:/windows/nircmd.exe
node udpcoms -ip 192.168.x.x power C:/Users/user/script.ps1 script args /mnt/c/windows/nircmd.exe

'''

Run scripts
'''
node udpcoms -cmds bash:powershell
node udpcoms -ip 192.168.x.x power C:/Users/user/script.ps1 script args
''''

Start programs
'''
node udpcoms -cmds spot:C:/Users/unpar/AppData/Roaming/Spotify/Spotify.exe,power:powershell
node udpcoms -ip 192.168.x.x spot
''''

Logout of your PC remotely
'''
node udpcoms -cmds power:powershell
node updcoms -ip 192.168.x.x power shutdown /l

```
Read files
'''
node udpcoms -cmds power:powershell 
node updcoms -ip 192.168.x.x power Get-Item -Path .\file.txt
'''

## Troubleshooting

Run in debug mode.

Linux```DEBUG=* node udpcoms```

Windows```set DEBUG=* & node udpcoms```
